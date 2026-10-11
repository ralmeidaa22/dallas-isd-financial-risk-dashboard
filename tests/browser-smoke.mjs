import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const screenshotDir = 'test-results';
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const externalRequests = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('request', (request) => {
  const url = request.url();
  if (/^https?:/.test(url) && !url.startsWith('http://127.0.0.1:')) externalRequests.push(url);
});

const target = process.argv[2] ?? 'http://127.0.0.1:4173';
await page.goto(target, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Load Sample Workbook' }).click();
await page.getByText('Data is ready for analysis').waitFor();

await page.getByRole('button', { name: 'Financial Overview', exact: true }).click();
await page.getByText('$1.8B', { exact: true }).first().waitFor();

await page.getByRole('button', { name: 'Scenario Analysis', exact: true }).click();
await page.getByRole('heading', { name: 'Fiscal Scenario Builder' }).waitFor();
if (await page.getByRole('button', { name: 'Scenario Library', exact: true }).count()) throw new Error('Scenario Library remains in navigation.');
if (await page.locator('[data-guided-driver="propertyTax"]:checked').getAttribute('value') !== 'tax-adopted') throw new Error('Adopted tax is not selected by default.');
if (await page.locator('[data-guided-driver="payroll"]:checked').getAttribute('value') !== 'payroll-adopted') throw new Error('Adopted payroll is not selected by default.');
if (await page.locator('[data-guided-driver="enrollment"]:checked').getAttribute('value') !== 'enrollment-stable') throw new Error('Stable enrollment is not selected by default.');
if (await page.locator('.scenario-kpi').count() !== 5) throw new Error('Scenario summary must contain exactly five KPIs.');
if (await page.locator('#operatingResultChart').count() !== 1) throw new Error('Operating result chart was not rendered.');
if (await page.locator('.calculation-details').getAttribute('open') !== null) throw new Error('Calculation Details must start closed.');
await page.getByText('Bridge reconciled.').waitFor();

const choose = async (label) => {
  await page.getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(100);
};
const scenarioResult = async () => ({
  sentence: await page.locator('.selected-summary p').innerText(),
  kpis: await page.locator('.scenario-kpi > strong').allInnerTexts(),
  takeaway: await page.locator('.takeaway p').innerText(),
  bridge: await page.locator('.bridge-row strong').allInnerTexts(),
});
const combinations = {};
combinations.adopted = await scenarioResult();
await choose('Upside');
await choose('Enrollment Growth');
combinations.revenueUpside = await scenarioResult();
if (!combinations.revenueUpside.kpis[2].startsWith('-')) throw new Error('Favorable scenario was incorrectly shown as a surplus.');
if (!await page.locator('.scenario-kpi.negative').nth(0).isVisible()) throw new Error('Remaining deficit lost its warning treatment.');
await choose('Stress');
await choose('Compensation Pressure');
await choose('Enrollment Decline');
combinations.combinedPressure = await scenarioResult();
await choose('Flat');
await choose('Workforce Adjustment');
combinations.workforceResponse = await scenarioResult();
await page.locator('.calculation-details summary').click();
await page.getByText('Scenario property-tax revenue').waitFor();
await page.locator('.calculation-details summary').click();
await page.getByRole('button', { name: 'Reset to Adopted Budget' }).click();
if (await page.locator('[data-guided-driver="propertyTax"]:checked').getAttribute('value') !== 'tax-adopted') throw new Error('Adopted reset failed.');
const setPercent = async (label, value) => {
  const input = page.getByLabel(label);
  await input.fill(String(value));
  await input.press('Tab');
  await page.waitForTimeout(80);
};

await choose('Stress');
await choose('Compensation Pressure');
await choose('Enrollment Decline');
if (await page.locator('.scenario-kpi > strong').nth(2).innerText() !== '-$309.4M') throw new Error('Combined guided scenario result changed unexpectedly.');
await page.getByRole('button', { name: 'Multi-Year Outlook', exact: true }).click();
await page.getByRole('heading', { name: 'Multi-Year Fiscal Outlook' }).waitFor();
await page.getByText('Adopted Budget', { exact: true }).first().waitFor();
if (await page.locator('.recovery-kpis').getByText('FY2028', { exact: true }).count() < 2) throw new Error('Default adopted outlook recovery timing changed.');
if (await page.locator('.outlook-table tbody').first().locator('tr').count() !== 6) throw new Error('Five-year outlook must include starting year plus five future years.');
if (await page.locator('.outlook-details').getAttribute('open') !== null) throw new Error('Outlook details must start closed.');
await page.getByRole('button', { name: 'Start from Selected Scenario' }).click();
await page.getByText('-$309.4M', { exact: true }).first().waitFor();

// No-balance path and apply-to-all behavior.
for (const label of ['All years Property-Tax Growth', 'All years Workforce Adjustment', 'All years Compensation Growth', 'All years Enrollment Change']) await setPercent(label, 0);
await page.getByRole('button', { name: 'Apply to All Years' }).click();
await page.getByText('Not reached', { exact: true }).first().waitFor();

// Adopted path reaching balance in FY2030 with two consecutive positive years.
await page.getByRole('button', { name: 'Start from Adopted Budget' }).click();
await page.getByRole('button', { name: 'Reset Annual Path' }).click();
for (const year of [2027, 2028, 2029]) await setPercent(`FY${year} growth`, 0);
await setPercent('FY2030 growth', 10);
await setPercent('FY2031 growth', 5);
if (await page.locator('.recovery-kpis').getByText('FY2030', { exact: true }).count() < 2) throw new Error('FY2030 sustained recovery path failed.');
await setPercent('Beginning Available Fund Balance', 500000000);
await page.locator('.recovery-kpis').getByText('$4.1M', { exact: true }).waitFor();
const fy2030Row = page.locator('.outlook-table tbody').first().locator('tr').filter({ hasText: 'FY2030' });
await fy2030Row.getByText('$4,122,158', { exact: true }).waitFor();

// Final-year-only balance is not sustained recovery.
await page.getByRole('button', { name: 'Reset Annual Path' }).click();
for (const year of [2027, 2028, 2029, 2030]) await setPercent(`FY${year} growth`, 0);
await setPercent('FY2031 growth', 10);
await page.locator('.recovery-kpis').getByText('Not confirmed', { exact: true }).waitFor();

// Depletion floors available balance at zero and separates funding shortfall.
await setPercent('Beginning Available Fund Balance', 50000000);
if (await page.locator('#outlookFundChart').count() !== 1) throw new Error('Fund balance chart was not rendered.');
const endingBalances = await page.locator('.outlook-table tbody').first().locator('tr td:nth-child(6)').allInnerTexts();
if (endingBalances.some((value) => value.includes('−') || value.startsWith('-'))) throw new Error('Available fund balance displayed below zero.');
await page.getByText('Funding Shortfall', { exact: true }).first().waitFor();
await page.locator('.outlook-details summary').click();
await page.getByText('Ending Funding Shortfall', { exact: true }).waitFor();
await page.locator('.outlook-details summary').click();
await setPercent('Beginning Available Fund Balance', '');
if (await page.locator('#outlookFundChart').count() !== 0) throw new Error('Fund balance chart remained after optional balance was removed.');
await page.getByText('Not provided', { exact: true }).first().waitFor();

// Horizon and source-governance controls.
for (const horizon of ['3', '7', '5']) { await page.getByLabel('Projection Horizon').selectOption(horizon); await page.getByLabel('Projection Horizon').press('Tab'); if (await page.locator('[data-path-index]').count() !== Number(horizon) * 4) throw new Error(`Horizon ${horizon} path size failed.`); }
await page.getByLabel('Source Type').selectOption('Official Projection');
await page.getByLabel('Source Type').press('Tab');
await page.getByText(/Official Projection is a user-classified source/).waitFor();
await page.getByLabel('Source or Methodology Note').fill('Browser verification planning document, page 1.');
await page.getByLabel('Source or Methodology Note').press('Tab');
await page.screenshot({ path: `${screenshotDir}/multi-year-outlook-verification.png`, fullPage: true });

await page.getByRole('button', { name: 'Break-Even Analysis', exact: true }).click();
await page.getByRole('heading', { name: 'Break-Even Analysis' }).waitFor();
if (await page.locator('.heatmap td').count() !== 36) throw new Error('Break-even heatmap is incomplete.');
if (await page.getByLabel('Break-even tax growth').inputValue() !== '-2.0' || await page.getByLabel('Break-even compensation growth').inputValue() !== '5.0' || await page.getByLabel('Break-even enrollment change').inputValue() !== '-5.0') throw new Error('Break-Even did not receive Selected Scenario assumptions.');
await setPercent('Break-even enrollment change', -2);
await page.getByText('Enrollment -2.0%').waitFor();

await page.getByRole('button', { name: 'Risk Drivers', exact: true }).click();
await page.getByRole('heading', { name: 'Key fiscal risk drivers' }).waitFor();
await page.getByRole('button', { name: 'Methodology', exact: true }).click();
await page.getByRole('heading', { name: 'Methodology' }).waitFor();
await page.getByText('This is a scenario-analysis tool, not a forecast.').waitFor();
await page.getByRole('heading', { name: 'Financial flexibility until recovery' }).waitFor();

await page.getByRole('button', { name: 'Scenario Analysis', exact: true }).click();
await page.getByRole('button', { name: 'Reset to Adopted Budget' }).click();
await page.screenshot({ path: `${screenshotDir}/desktop-verification-v2.png`, fullPage: true });

// Always verify the distributed public workbook. An optional local original can also be checked.
const uploadPaths = [fileURLToPath(new URL('../src/assets/Dallas-ISD-Budget-Public.xlsx', import.meta.url))];
if (process.env.ORIGINAL_WORKBOOK_PATH) uploadPaths.push(process.env.ORIGINAL_WORKBOOK_PATH);
for (const workbookPath of uploadPaths) {
  await page.getByRole('button', { name: 'Upload & Validation', exact: true }).click();
  await page.locator('#fileInput').setInputFiles(workbookPath);
  await page.getByText('Data is ready for analysis').waitFor();
}
console.log(`Workbook upload verification passed for ${uploadPaths.length} file(s).`);

if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`);
if (externalRequests.length) throw new Error(`Unexpected external runtime requests: ${externalRequests.join(' | ')}`);
console.log(`Browser smoke test passed: guided scenarios, multi-year recovery paths, fund-balance floor, all tabs, bridge, details, heatmap, and console.\n${JSON.stringify(combinations, null, 2)}`);
await browser.close();
