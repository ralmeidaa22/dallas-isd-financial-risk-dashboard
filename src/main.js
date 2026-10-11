import Chart from 'chart.js/auto';
import sampleWorkbookUrl from './assets/Dallas-ISD-Budget-Public.xlsx?url';
import { parseWorkbook } from './lib/workbook.js';
import { validateWorkbook } from './lib/validation.js';
import {
  ADOPTED_ASSUMPTIONS,
  buildBreakEvenMatrix,
  calculateScenario,
  calculateScenarios,
  GUIDED_ASSUMPTIONS,
  getBaseline,
  matchGuidedAssumptions,
  overviewMetrics,
  requiredTaxGrowth,
  requiredWorkforceAdjustment,
} from './lib/calculations.js';
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent, formatRatio, formatSignedCurrency } from './lib/format.js';
import { buildMultiYearOutlook, createAnnualPath, DEFAULT_ANALYTICAL_THRESHOLD, DEFAULT_ANNUAL_ASSUMPTIONS, DEFAULT_OUTLOOK_HORIZON, resizeAnnualPath } from './lib/runway.js';
import './styles.css';

const state = {
  file: null,
  parsed: null,
  validation: null,
  baseline: null,
  currentScenario: { id: 'selected-scenario', name: 'Selected Scenario', classification: 'Official Budget Assumption', ...ADOPTED_ASSUMPTIONS },
  runway: {
    beginningBalance: null,
    fiscalYear: 'FY2026',
    assumptionSetName: '',
    sourceType: 'Illustrative Assumption',
    sourceNote: '',
    threshold: DEFAULT_ANALYTICAL_THRESHOLD,
    horizon: DEFAULT_OUTLOOK_HORIZON,
    activeSource: 'adopted',
    annualPath: createAnnualPath(),
    applyAll: { ...DEFAULT_ANNUAL_ASSUMPTIONS },
  },
  breakEven: { taxGrowth: 0.05, compensationChange: 0, enrollmentChange: 0 },
  activeTab: 'upload',
  charts: [],
};

const app = document.querySelector('#app');

function icon(name) {
  const icons = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M21.7 18 13.7 4a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

const navItems = [
  ['upload', 'Upload & Validation'],
  ['overview', 'Financial Overview'],
  ['scenarios', 'Scenario Analysis'],
  ['runway', 'Multi-Year Outlook'],
  ['breakeven', 'Break-Even Analysis'],
  ['risks', 'Risk Drivers'],
  ['methodology', 'Methodology'],
];

function shell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand-mark">DF</div>
      <div class="brand-copy"><h1>Dallas ISD Fiscal Stress Lab</h1><p>Multivariable Budget Analysis &amp; Fiscal Stress Testing</p></div>
      <div class="version-mark">V2 · MULTIVARIABLE</div>
      <div class="privacy-pill">${icon('shield')} <span>Local processing only</span></div>
    </header>
    <div class="privacy-banner">${icon('shield')}<span><strong>Your workbook is processed locally in your browser.</strong> No financial data is uploaded or transmitted.</span></div>
    <nav class="tabs" aria-label="Dashboard sections">
      ${navItems.map(([id, label]) => `<button class="tab ${state.activeTab === id ? 'active' : ''}" data-tab="${id}" ${id !== 'upload' && !state.baseline ? 'disabled' : ''}>${label}</button>`).join('')}
    </nav>
    <main id="content"></main>
    <footer><span>Dallas ISD Fiscal Stress Lab · FY 2025–2026</span><span>Scenario-analysis tool — not a forecast, rating or investment recommendation</span></footer>`;
  bindNavigation();
  renderActiveTab();
}

function bindNavigation() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    shell();
  }));
}

function renderActiveTab() {
  state.charts.forEach((chart) => chart.destroy());
  state.charts = [];
  const content = document.querySelector('#content');
  const renderers = { upload: renderUpload, overview: renderOverview, scenarios: renderScenarios, runway: renderRunway, breakeven: renderBreakEven, risks: renderRisks, methodology: renderMethodology };
  renderers[state.activeTab](content);
}

function renderUpload(container) {
  container.innerHTML = `
    <section class="page-heading">
      <div><span class="eyebrow">Data intake</span><h2>Import the adopted budget workbook</h2><p>Drop the Dallas ISD workbook below. The file stays on this device.</p></div>
      ${state.validation ? `<span class="status-badge ${state.validation.status.toLowerCase()}"><i></i>${state.validation.status}</span>` : ''}
    </section>
    <section class="upload-layout">
      <div class="panel upload-panel">
        <div id="dropzone" class="dropzone" tabindex="0" role="button" aria-label="Drop or select an XLSX workbook">
          <div class="upload-icon">${icon('upload')}</div><h3>${state.file ? 'Workbook loaded' : 'Drop your workbook here'}</h3>
          <p>${state.file ? `${escapeHtml(state.file.name)} · ${formatFileSize(state.file.size)}` : 'Only Microsoft Excel .xlsx files are accepted'}</p>
          <label class="button primary" for="fileInput">Choose workbook</label>
          <input id="fileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
        </div>
        <div class="sample-row"><div><strong>Need a clean starting point?</strong><span>Use the included Dallas ISD reference workbook.</span></div><button id="loadSample" class="button secondary">${icon('file')} Load Sample Workbook</button></div>
        <div id="fileError" class="inline-error" hidden></div>
      </div>
      <aside class="panel process-panel"><span class="eyebrow">Local workflow</span><ol>
        <li class="${state.file ? 'done' : 'current'}"><span>1</span><div><strong>Select workbook</strong><small>Choose a valid .xlsx file</small></div></li>
        <li class="${state.parsed ? 'done' : state.file ? 'current' : ''}"><span>2</span><div><strong>Map financial data</strong><small>Find labels and FY26 headers</small></div></li>
        <li class="${state.validation?.status === 'Ready' ? 'done' : state.parsed ? 'current' : ''}"><span>3</span><div><strong>Validate &amp; analyze</strong><small>Reconcile totals and scenarios</small></div></li>
      </ol></aside>
    </section>
    ${state.validation ? validationMarkup() : '<section class="empty-callout"><span>Validation results will appear here after a workbook is loaded.</span></section>'}`;
  bindUpload();
}

function validationMarkup() {
  const validation = state.validation;
  const reconciliation = (label, item) => `<div class="recon-row"><span>${item.pass ? icon('check') : icon('alert')}</span><div><strong>${label}</strong><small>${formatCurrency(item.calculated)} calculated · ${formatCurrency(item.reported)} reported</small></div><b class="${item.pass ? 'pass' : 'fail'}">${item.pass ? 'Matched' : 'Review'}</b></div>`;
  return `<section class="validation-grid">
    <div class="panel validation-summary"><div class="panel-title"><div><span class="eyebrow">Workbook validation</span><h3>${validation.status === 'Ready' ? 'Data is ready for analysis' : 'Workbook needs attention'}</h3></div><span class="status-badge ${validation.status.toLowerCase()}"><i></i>${validation.status}</span></div>
      <div class="validation-stats"><div><b>${validation.detectedSheets.length}/7</b><span>Required sheets</span></div><div><b>${validation.foundMetrics.filter((item) => item.key !== 'budgetSummaryExpenditures').length}/9</b><span>Core metrics</span></div><div><b>${Number(validation.revenueReconciliation.pass) + Number(validation.expenditureReconciliation.pass)}/2</b><span>Reconciliations</span></div></div>
      <div class="reconciliations">${reconciliation('General Fund revenue', validation.revenueReconciliation)}${reconciliation('General Fund expenditures', validation.expenditureReconciliation)}</div></div>
    <div class="panel detail-panel"><h3>Coverage detail</h3><div class="detail-group"><strong>Sheets detected</strong><div class="chips">${validation.detectedSheets.map((sheet) => `<span>${icon('check')}${sheet}</span>`).join('')}</div></div>
      ${validation.missingSheets.length ? `<div class="detail-group error-list"><strong>Sheets missing</strong><p>${validation.missingSheets.join(', ')}</p></div>` : ''}
      ${validation.missingMetrics.length ? `<div class="detail-group error-list"><strong>Metrics missing</strong>${validation.missingMetrics.map((metric) => `<p>${escapeHtml(metric.name)} — ${escapeHtml(metric.error)}</p>`).join('')}</div>` : `<div class="all-found">${icon('check')} All nine required financial metrics were found by label.</div>`}
      ${validation.status !== 'Error' ? '<button class="button primary wide" data-tab="overview">Open Financial Overview →</button>' : ''}</div>
  </section>`;
}

function bindUpload() {
  const dropzone = document.querySelector('#dropzone');
  const input = document.querySelector('#fileInput');
  const prevent = (event) => { event.preventDefault(); event.stopPropagation(); };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, prevent));
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, () => dropzone.classList.add('dragging')));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, () => dropzone.classList.remove('dragging')));
  dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
  dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') input.click(); });
  input.addEventListener('change', () => loadFile(input.files[0]));
  document.querySelector('#loadSample').addEventListener('click', loadSample);
  bindNavigation();
}

async function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.xlsx')) return showFileError('Please select a Microsoft Excel workbook with the .xlsx extension.');
  try { processBuffer(await file.arrayBuffer(), file); } catch (error) { showFileError(`The workbook could not be read: ${error.message}`); }
}

async function loadSample() {
  try {
    const response = await fetch(sampleWorkbookUrl);
    if (!response.ok) throw new Error(`Sample file returned ${response.status}`);
    const buffer = await response.arrayBuffer();
    processBuffer(buffer, { name: 'Dallas-ISD-Budget-Public.xlsx', size: buffer.byteLength });
  } catch (error) { showFileError(`The sample workbook could not be loaded: ${error.message}`); }
}

function processBuffer(buffer, file) {
  state.file = file;
  state.parsed = parseWorkbook(buffer);
  state.validation = validateWorkbook(state.parsed);
  state.baseline = state.validation.status === 'Error' ? null : getBaseline(state.parsed.metrics);
  shell();
}

function showFileError(message) { const target = document.querySelector('#fileError'); target.textContent = message; target.hidden = false; }

function renderOverview(container) {
  const metric = overviewMetrics(state.baseline);
  const cards = [
    ['Total GF Revenue', formatCompactCurrency(metric.totalRevenue), formatCurrency(metric.totalRevenue), 'neutral'],
    ['Total GF Expenditures', formatCompactCurrency(metric.totalExpenditures), formatCurrency(metric.totalExpenditures), 'neutral'],
    ['Budget Surplus / Deficit', formatCompactCurrency(metric.surplusDeficit), formatSignedCurrency(metric.surplusDeficit), metric.surplusDeficit < 0 ? 'negative' : 'positive'],
    ['Revenue Coverage Ratio', formatRatio(metric.coverageRatio), `${formatPercent(metric.coverageRatio)} of expenditures covered`, metric.coverageRatio < 1 ? 'warning' : 'positive'],
    ['Property Tax / Local Revenue', formatPercent(metric.propertyTaxConcentration), 'Local revenue concentration', metric.propertyTaxConcentration > 0.75 ? 'warning' : 'neutral'],
    ['Payroll / GF Expenditures', formatPercent(metric.payrollConcentration), 'Personnel cost concentration', metric.payrollConcentration > 0.75 ? 'warning' : 'neutral'],
    ['Recapture / GF Expenditures', formatPercent(metric.recaptureConcentration), formatCurrency(state.baseline.recapture), 'neutral'],
    ['Revenue per Pupil', formatCurrency(metric.revenuePerPupil), `${formatNumber(state.baseline.enrollment)} projected enrollment`, 'neutral'],
    ['Expenditure per Pupil', formatCurrency(metric.expenditurePerPupil), 'FY26 adopted spending', 'neutral'],
  ];
  container.innerHTML = `<section class="page-heading"><div><span class="eyebrow">Financial overview</span><h2>FY26 adopted operating profile</h2><p>Core General Fund metrics extracted from ${escapeHtml(state.file.name)}.</p></div><span class="as-of">FY 2025–2026</span></section>
    <section class="metric-grid">${cards.map(([label, value, detail, tone]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('')}</section>
    <section class="overview-strip panel"><div><span class="eyebrow">Operating position</span><h3>${metric.surplusDeficit < 0 ? 'Adopted revenues do not fully cover expenditures' : 'Adopted revenues cover expenditures'}</h3><p>For every $1.00 of General Fund spending, the adopted budget provides ${formatRatio(metric.coverageRatio)} of revenue.</p></div><div class="coverage-gauge"><div class="gauge-label"><span>Revenue coverage</span><b>${formatPercent(metric.coverageRatio)}</b></div><div class="gauge-track"><i style="width:${Math.min(100, metric.coverageRatio * 100)}%"></i><em style="left:100%"></em></div><small>1.00x balanced-budget threshold</small></div></section>`;
}

function renderScenarios(container) {
  const row = calculateScenarios(state.baseline, [state.currentScenario])[0];
  const adopted = row.adoptedReference;
  const matched = matchGuidedAssumptions(state.currentScenario);
  container.innerHTML = `
    <section class="page-heading scenario-heading"><div><span class="eyebrow">Guided fiscal stress test</span><h2>Fiscal Scenario Builder</h2><p>Select one assumption for each fiscal driver and compare the resulting operating position with the FY2026 Adopted Budget.</p></div><button id="resetAdopted" class="button primary">Reset to Adopted Budget</button></section>
    <section class="builder-section"><div class="section-heading compact"><div><span class="eyebrow">Step 1 · Select assumptions</span><h2>Build a Scenario</h2></div></div>
      <div class="driver-groups">${driverGroupMarkup('propertyTax', 'PROPERTY-TAX GROWTH', GUIDED_ASSUMPTIONS.propertyTax, matched.tax?.id, 'blue')}${driverGroupMarkup('payroll', 'PAYROLL', GUIDED_ASSUMPTIONS.payroll, matched.payroll?.id, 'purple')}${driverGroupMarkup('enrollment', 'ENROLLMENT', GUIDED_ASSUMPTIONS.enrollment, matched.enrollment?.id, 'amber')}</div>
    </section>
    <section class="selected-summary"><div class="section-heading compact"><div><span class="eyebrow">Step 2 · Review operating result</span><h2>Selected Scenario</h2><p>${scenarioSentence(matched)}</p></div></div>
      <div class="scenario-kpis">${scenarioKpis(row, adopted)}</div>
    </section>
    ${scenarioAssessment(row)}
    <section class="scenario-explanation"><div class="section-heading compact"><div><span class="eyebrow">Step 3 · Understand what changed</span><h2>Operating Result: Adopted vs. Selected</h2></div></div>
      <div class="result-grid"><article class="panel chart-card operating-chart"><div class="canvas-wrap"><canvas id="operatingResultChart"></canvas></div><p class="chart-footnote">Zero represents a balanced operating result. Deficits remain below zero.</p></article>${operatingBridgeMarkup(row)}</div>
    </section>
    ${keyTakeawayMarkup(row)}
    ${calculationDetailsMarkup(row)}`;
  bindScenarioControls();
  drawOperatingResultChart(row);
}

function driverGroupMarkup(driver, title, options, selectedId, tone) {
  return `<fieldset class="driver-group ${tone}"><legend>${title}</legend>${options.map((option) => `<label class="radio-card ${selectedId === option.id ? 'selected' : ''}"><input type="radio" name="${driver}" value="${option.id}" data-guided-driver="${driver}" ${selectedId === option.id ? 'checked' : ''}><span class="radio-indicator"></span><span class="option-copy"><strong>${option.name}</strong><b>${option.value}</b><small>${option.description}</small></span></label>`).join('')}</fieldset>`;
}

function bindScenarioControls() {
  document.querySelectorAll('[data-guided-driver]').forEach((input) => input.addEventListener('change', () => {
    const option = GUIDED_ASSUMPTIONS[input.dataset.guidedDriver].find((item) => item.id === input.value);
    state.currentScenario = { ...state.currentScenario, ...option, id: 'selected-scenario', name: 'Selected Scenario', classification: option.description.includes('Official') ? 'Official Budget Assumption' : 'Illustrative Assumption' };
    delete state.currentScenario.value;
    delete state.currentScenario.description;
    state.currentScenario.classification = Object.entries(ADOPTED_ASSUMPTIONS).every(([key, value]) => state.currentScenario[key] === value) ? 'Official Budget Assumption' : 'Illustrative Assumption';
    state.breakEven = { taxGrowth: state.currentScenario.growth, compensationChange: state.currentScenario.compensationChange, enrollmentChange: state.currentScenario.enrollmentChange };
    renderScenarios(document.querySelector('#content'));
  }));
  document.querySelector('#resetAdopted').addEventListener('click', resetGuidedScenario);
}

function resetGuidedScenario() {
  state.currentScenario = { id: 'selected-scenario', name: 'Selected Scenario', classification: 'Official Budget Assumption', ...ADOPTED_ASSUMPTIONS };
  state.breakEven = { taxGrowth: 0.05, compensationChange: 0, enrollmentChange: 0 };
  renderScenarios(document.querySelector('#content'));
}

function scenarioSentence(matched) {
  const payroll = matched.payroll.id === 'payroll-adopted' ? 'adopted payroll' : matched.payroll.name.toLowerCase();
  return `${matched.tax.value} property-tax growth, ${payroll} and ${matched.enrollment.name.toLowerCase()}.`;
}

function scenarioKpis(row, adopted) {
  const definitions = [
    ['Total GF Revenue', row.totalRevenue, adopted.totalRevenue, 'revenue'],
    ['Total GF Expenditures', row.totalExpenditures, adopted.totalExpenditures, 'expenditures'],
    ['Budget Surplus / Deficit', row.surplusDeficit, adopted.surplusDeficit, 'result'],
    ['Revenue Coverage Ratio', row.coverageRatio, adopted.coverageRatio, 'coverage'],
    ['Per-Pupil Funding Gap', row.perPupilFundingGap, adopted.perPupilFundingGap, 'gap'],
  ];
  return definitions.map(([label, value, base, type]) => {
    const isCost = type === 'expenditures';
    const change = value - base;
    const operatingChange = isCost ? -change : change;
    const formatter = type === 'coverage' ? formatRatio : formatCompactCurrency;
    const resultTone = (type === 'result' || type === 'gap') && value < 0 ? 'negative' : type === 'coverage' && value < 1 ? 'warning' : '';
    const direction = Math.abs(change) <= (type === 'coverage' ? 0.0005 : 1) ? '<span class="direction neutral">No Change vs. Adopted Budget</span>' : `<span class="direction ${operatingChange > 0 ? 'improves' : 'worsens'}">${operatingChange > 0 ? 'Improves' : 'Worsens'} by ${formatter(Math.abs(change))} vs. Adopted Budget</span>`;
    const coverageNote = type === 'coverage' && value < 1 ? '<small>Revenue does not fully cover expenditures.</small>' : '';
    return `<article class="metric-card scenario-kpi ${resultTone}"><span>${label}</span><strong>${formatter(value)}</strong>${direction}${coverageNote}</article>`;
  }).join('');
}

function scenarioAssessment(row) {
  const impacts = [['Property-tax revenue', row.propertyTaxImpact], ['Payroll', row.payrollImpact], ['Enrollment / state funding', row.enrollmentStateImpact]];
  const main = impacts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const messages = [];
  if (row.surplusDeficit < 0) messages.push(['Operating deficit', 'Revenue remains below expenditures.']);
  if (row.coverageRatio < 1) messages.push(['Coverage', `${formatRatio(row.coverageRatio)}, below full operating coverage.`]);
  if (row.enrollmentChange < 0 && row.expenditurePerPupil > row.adoptedReference.expenditurePerPupil) messages.push(['Cost rigidity', 'Expenditure per pupil rises as enrollment declines.']);
  else if (Math.abs(main[1]) > 1) messages.push([main[1] > 0 ? 'Main improvement driver' : 'Main pressure driver', `${main[0]}.`]);
  return `<section class="panel assessment-panel"><div><span class="eyebrow">Scenario Assessment</span></div><div class="assessment-messages">${messages.slice(0, 3).map(([label, detail]) => `<p><strong>${label}:</strong> ${detail}</p>`).join('')}</div></section>`;
}

function operatingBridgeMarkup(row) {
  const impacts = [['Property-Tax Impact', row.propertyTaxImpact], ['Payroll Impact', row.payrollImpact], ['Enrollment / State-Funding Impact', row.enrollmentStateImpact]];
  return `<article class="panel bridge-card"><span class="eyebrow">What Changed vs. Adopted Budget?</span><h3>Operating-result bridge</h3><p>Shows how each selected assumption changes the operating result relative to the adopted budget.</p><div class="bridge-rows"><div class="bridge-row base"><span>Adopted Budget Deficit</span><strong>${formatCompactCurrency(row.adoptedReference.surplusDeficit)}</strong></div>${impacts.map(([label, value]) => `<div class="bridge-row"><span>${label}<small>${Math.abs(value) <= 1 ? 'No Change' : value > 0 ? 'Improves' : 'Worsens'}</small></span><strong class="${value < 0 ? 'negative-value' : ''}">${formatSignedCurrency(value)}</strong></div>`).join('')}<div class="bridge-row total"><span>Selected Scenario Deficit</span><strong class="${row.surplusDeficit < 0 ? 'negative-value' : ''}">${formatCompactCurrency(row.surplusDeficit)}</strong></div></div><small class="reconcile-note ${row.attributionReconciles ? 'pass' : 'fail'}">${row.attributionReconciles ? 'Bridge reconciled.' : 'Reconciliation warning.'}</small></article>`;
}

function keyTakeawayMarkup(row) {
  const change = row.deficitChangeVsAdopted;
  const impacts = [['property-tax revenue', row.propertyTaxImpact], ['payroll', row.payrollImpact], ['enrollment and state funding', row.enrollmentStateImpact]];
  const main = impacts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const first = Math.abs(change) <= 1 ? 'The selected scenario produces no change in the operating result versus the Adopted Budget.' : `The selected scenario ${change > 0 ? 'improves' : 'worsens'} the operating result by ${formatCompactCurrency(Math.abs(change))}, primarily because of ${main[0]}.`;
  const second = row.surplusDeficit < 0 ? `However, Dallas ISD would still report an estimated ${formatCompactCurrency(Math.abs(row.surplusDeficit))} deficit${row.coverageRatio < 1 ? ', and revenue coverage would remain below 1.00x' : ''}.` : `The selected scenario produces an estimated ${formatCompactCurrency(row.surplusDeficit)} surplus with ${formatRatio(row.coverageRatio)} revenue coverage.`;
  return `<section class="panel takeaway"><span class="eyebrow">Key Takeaway</span><p>${first} ${second}</p></section>`;
}

function calculationDetailsMarkup(row) {
  const groups = [
    ['Revenue', [['Scenario property-tax revenue', row.currentYearTaxRevenue], ['Other local revenue', row.otherLocalRevenue], ['Scenario state revenue', row.stateRevenue], ['Federal revenue', row.federalRevenue], ['Total GF revenue', row.totalRevenue]]],
    ['Expenditures', [['Base payroll', state.baseline.payroll], ['Scenario payroll', row.payroll], ['Non-payroll expenditures', state.baseline.nonPayrollExpenditures], ['Total GF expenditures', row.totalExpenditures]]],
    ['Enrollment and per-pupil', [['Scenario enrollment', row.enrollment, formatNumber], ['Revenue per pupil', row.revenuePerPupil], ['Expenditure per pupil', row.expenditurePerPupil], ['Per-pupil funding gap', row.perPupilFundingGap, formatSignedCurrency]]],
    ['Model checks', [['Change in operating result vs. Adopted', row.deficitChangeVsAdopted, formatSignedCurrency], ['Attribution reconciliation', row.attributionVariance, formatSignedCurrency]]],
  ];
  return `<details class="panel calculation-details"><summary><span><span class="eyebrow">Step 4 · Optional audit trail</span><strong>Show Calculation Details</strong></span><b>+</b></summary><div class="calculation-grid">${groups.map(([title, items]) => `<section><h3>${title}</h3>${items.map(([label, value, formatter = formatCurrency]) => `<div><span>${label}</span><strong>${formatter(value)}</strong></div>`).join('')}</section>`).join('')}</div></details>`;
}

function chartOptions(yCallback) {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#10283f', padding: 12, cornerRadius: 8 } }, scales: { x: { grid: { display: false }, ticks: { color: '#52667a', font: { weight: 600 } } }, y: { border: { display: false }, grid: { color: '#e5ebf0' }, ticks: { color: '#6d7f90', callback: yCallback } } } };
}

function drawOperatingResultChart(row) {
  state.charts.forEach((chart) => chart.destroy());
  state.charts = [
    new Chart(document.querySelector('#operatingResultChart'), { type: 'bar', data: { labels: ['Adopted Budget', 'Selected Scenario'], datasets: [{ data: [row.adoptedReference.surplusDeficit / 1e6, row.surplusDeficit / 1e6], backgroundColor: ['#8293a3', row.surplusDeficit < 0 ? '#c55445' : '#2f8f61'], borderRadius: 6, maxBarThickness: 82 }] }, options: { ...chartOptions((value) => `$${value}M`), scales: { ...chartOptions((value) => `$${value}M`).scales, y: { ...chartOptions((value) => `$${value}M`).scales.y, beginAtZero: true } } } }),
  ];
}

function getOutlookStartingPoint() {
  if (state.runway.activeSource === 'adopted') return { label: 'Adopted Budget', classification: 'Official Budget Assumption', result: calculateScenario(state.baseline, ADOPTED_ASSUMPTIONS) };
  return { label: 'Selected Scenario', classification: state.currentScenario.classification, result: calculateScenario(state.baseline, state.currentScenario) };
}

function renderRunway(container) {
  const selected = getOutlookStartingPoint();
  const projection = buildMultiYearOutlook({ startingScenario: selected.result, startingFiscalYear: state.runway.fiscalYear, horizon: state.runway.horizon, annualPath: state.runway.annualPath, beginningBalance: state.runway.beginningBalance, threshold: state.runway.threshold });
  container.innerHTML = `
    <section class="page-heading"><div><span class="eyebrow">Annual fiscal trajectory</span><h2>Multi-Year Fiscal Outlook</h2><p>Projects annual operating results under a user-defined assumption path and evaluates whether fund balance can support the district until recovery.</p></div><div class="button-group"><button id="useAdoptedBudget" class="button ${state.runway.activeSource === 'adopted' ? 'primary' : 'secondary'}">Start from Adopted Budget</button><button id="useSelectedScenario" class="button ${state.runway.activeSource === 'selected' ? 'primary' : 'secondary'}">Start from Selected Scenario</button></div></section>
    ${startingPointMarkup(selected)}
    ${outlookSettingsMarkup()}
    ${annualPathMarkup()}
    ${projection.validation.valid ? outlookResultsMarkup(projection, selected) : `<section class="validation-message error outlook-error">${projection.validation.errors.join(' ')}</section>`}
    <section class="proxy-note panel"><div>${icon('info')}</div><div><h3>Annual assumption paths and external models</h3><p>Annual assumptions may be entered from official planning documents, analyst forecasts or external model outputs. Model volatility alone does not directly change the fiscal outlook; it must be translated into an annual revenue, payroll or enrollment assumption.</p></div></section>`;
  bindOutlookControls();
  if (projection.validation.valid) drawOutlookCharts(projection);
}

function startingPointMarkup(selected) {
  const items = [['Starting Fiscal Year', state.runway.fiscalYear], ['Starting Revenue', formatCompactCurrency(selected.result.totalRevenue)], ['Starting Expenditures', formatCompactCurrency(selected.result.totalExpenditures)], ['Starting Surplus / Deficit', formatCompactCurrency(selected.result.surplusDeficit)], ['Starting Coverage Ratio', formatRatio(selected.result.coverageRatio)]];
  return `<section class="starting-point panel"><div><span class="eyebrow">Starting point</span><h3>${selected.label}</h3><small>${selected.classification}</small></div>${items.map(([label, value]) => `<div><span>${label}</span><strong class="${label.includes('Deficit') && selected.result.surplusDeficit < 0 ? 'negative-value' : ''}">${value}</strong></div>`).join('')}</section>`;
}

function outlookSettingsMarkup() {
  const sourceTypes = ['Illustrative Assumption', 'Official Projection', 'Analyst Assumption', 'External Model Output'];
  const officialWarning = state.runway.sourceType === 'Official Projection' && !state.runway.sourceNote.trim();
  return `<section class="runway-form panel"><div class="runway-form-head"><div><span class="eyebrow">Projection settings</span><h3>Assumption path governance</h3></div><span class="user-data-flag">User-classified source</span></div><div class="runway-input-grid outlook-settings">
    <label><span>Starting Fiscal Year</span><input id="fiscalYear" aria-label="Starting Fiscal Year" value="${escapeHtml(state.runway.fiscalYear)}"></label>
    <label><span>Projection Horizon</span><select id="runwayHorizon" aria-label="Projection Horizon">${[3,5,7].map((year) => `<option value="${year}" ${year === state.runway.horizon ? 'selected' : ''}>${year} years</option>`).join('')}</select></label>
    <label><span>Assumption Set Name</span><input id="assumptionSetName" aria-label="Assumption Set Name" placeholder="Management Base Case" value="${escapeHtml(state.runway.assumptionSetName)}"></label>
    <label><span>Source Type</span><select id="sourceType" aria-label="Source Type">${sourceTypes.map((type) => `<option ${type === state.runway.sourceType ? 'selected' : ''}>${type}</option>`).join('')}</select><small>User-classified source</small></label>
    <label><span>Beginning Available Fund Balance</span><div class="currency-input"><b>$</b><input id="beginningBalance" aria-label="Beginning Available Fund Balance" type="number" min="0" step="1000000" placeholder="Optional" value="${state.runway.beginningBalance ?? ''}"></div><button id="useIllustrative" class="text-button" type="button">Use Illustrative Assumption</button></label>
    <label><span>Analytical Threshold — not Dallas ISD policy</span><div class="percent-input"><input id="runwayThreshold" aria-label="Analytical Threshold" type="number" min="0" max="100" step="1" value="${(state.runway.threshold * 100).toFixed(0)}"><b>% of expenditures</b></div></label>
    <label class="wide-field"><span>Source / Methodology Note</span><textarea id="sourceNote" aria-label="Source or Methodology Note" placeholder="Document, page/table, analyst, model, forecast date or methodology">${escapeHtml(state.runway.sourceNote)}</textarea></label>
  </div>${officialWarning ? '<div class="validation-message warning">Official Projection is a user-classified source. Add a source or methodology note to document it.</div>' : ''}</section>`;
}

function annualPathMarkup() {
  const start = Number(state.runway.fiscalYear.match(/\d{4}/)?.[0] ?? 2026);
  const inputs = (prefix, values) => [['growth','Property-Tax Growth'],['workforceChange','Workforce Adjustment'],['compensationChange','Compensation Growth'],['enrollmentChange','Enrollment Change']].map(([key, label]) => `<label><span>${label}</span><div class="percent-input"><input aria-label="${prefix} ${label}" data-${prefix === 'All years' ? 'apply-all' : 'path-key'}="${key}" ${prefix === 'All years' ? '' : `data-path-index="${prefix}"`} type="number" min="-100" step="0.1" value="${(values[key] * 100).toFixed(1)}"><b>%</b></div></label>`).join('');
  return `<section class="annual-path-section"><div class="section-heading"><div><span class="eyebrow">Annual assumption path</span><h2>Future-Year Assumptions</h2><p>Each percentage is an annual change from the immediately preceding fiscal year.</p></div><button id="resetAnnualPath" class="button secondary">Reset Annual Path</button></div><div class="panel apply-all"><div><span class="eyebrow">Apply Same Assumptions to All Years</span></div>${inputs('All years', state.runway.applyAll)}<button id="applyAllYears" class="button primary">Apply to All Years</button></div><div class="panel path-table-wrap"><table class="path-table"><thead><tr><th>Fiscal Year</th><th>Property-Tax Growth</th><th>Workforce Adjustment</th><th>Compensation Growth</th><th>Enrollment Change</th></tr></thead><tbody>${state.runway.annualPath.map((year, index) => `<tr><th>FY${start + index + 1}</th>${['growth','workforceChange','compensationChange','enrollmentChange'].map((key) => `<td><div class="percent-input"><input aria-label="FY${start + index + 1} ${key}" data-path-index="${index}" data-path-key="${key}" type="number" min="-100" step="0.1" value="${(year[key] * 100).toFixed(1)}"><b>%</b></div></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}

function outlookResultsMarkup(projection, selected) {
  const firstBalance = projection.firstBalancedYear ?? 'Not reached';
  const sustained = projection.sustainedRecoveryYear ?? (projection.lastYearOnlyBalance ? 'Not confirmed' : 'Not reached');
  const fundAtBalance = !projection.firstBalancedYear ? 'N/A' : !projection.beginningBalanceProvided ? 'Not provided' : formatCompactCurrency(projection.fundBalanceAtFirstBalance);
  const cards = [['First Balanced Year', firstBalance], ['Sustained Recovery Year', sustained], ['Cumulative Deficit Before First Balance', formatCompactCurrency(projection.cumulativeDeficitBeforeBalance)], ['Fund Balance Remaining at First Balance', fundAtBalance], ['Minimum Coverage Ratio', formatRatio(projection.minimumCoverageRatio)]];
  return `<section class="outlook-results"><div class="section-heading"><div><span class="eyebrow">Recovery summary</span><h2>Path to Operating Balance</h2></div></div><div class="recovery-kpis">${cards.map(([label,value]) => `<article class="metric-card ${label.includes('Coverage') && projection.minimumCoverageRatio < 1 ? 'warning' : ''}"><span>${label}</span><strong>${value}</strong></article>`).join('')}</div>
    <section class="outlook-chart-grid"><article class="panel chart-card"><span class="eyebrow">Annual Operating Result</span><h3>Deficit / Surplus by Fiscal Year</h3><div class="canvas-wrap tall"><canvas id="outlookResultChart"></canvas></div><div class="recovery-markers"><span>First balance: <b>${projection.firstBalancedYear ?? 'Not reached'}</b></span><span>Sustained recovery: <b>${projection.sustainedRecoveryYear ?? (projection.lastYearOnlyBalance ? 'Not confirmed' : 'Not reached')}</b></span></div></article>${projection.beginningBalanceProvided ? '<article class="panel chart-card"><span class="eyebrow">Fund Balance Through Recovery</span><h3>Available Balance and Funding Shortfall</h3><div class="canvas-wrap tall"><canvas id="outlookFundChart"></canvas></div></article>' : ''}</section>
    <section class="panel interpretation-card outlook-interpretation"><span class="eyebrow">Outlook Interpretation</span><p>${outlookInterpretation(projection, selected)}</p></section>
    ${annualOutlookTable(projection)}
  </section>`;
}

function rowStatus(row, balanceProvided) {
  if (balanceProvided && row.endingFundingShortfall > 0) return ['Funding Shortfall', 'Fund Balance Depleted'];
  if (balanceProvided && row.endingFundBalance === 0 && row.surplusDeficit < 0) return ['Fund Balance Depleted', 'Deficit'];
  if (balanceProvided && row.endingFundBalance < row.thresholdAmount) return [row.surplusDeficit >= 0 ? 'Balanced' : 'Below Threshold', row.surplusDeficit >= 0 ? 'Below Threshold' : 'Deficit'];
  if (row.surplusDeficit > 1) return ['Surplus', ''];
  if (row.surplusDeficit >= 0) return ['Balanced', ''];
  return ['Deficit', ''];
}

function annualOutlookTable(projection) {
  return `<section class="panel table-panel outlook-table"><div class="table-heading"><div><span class="eyebrow">Annual fiscal trajectory</span><h3>Annual Fiscal Outlook</h3></div><span>Starting year plus ${state.runway.horizon} future years</span></div><div class="table-scroll"><table><thead><tr><th>Fiscal Year</th><th>Total Revenue</th><th>Total Expenditures</th><th>Surplus / Deficit</th><th>Coverage</th><th>Ending Fund Balance</th><th>Status</th></tr></thead><tbody>${projection.rows.map((row) => { const [status,note] = rowStatus(row, projection.beginningBalanceProvided); const shortfallNote = projection.beginningBalanceProvided && row.endingFundingShortfall > 0 ? `Outstanding shortfall: ${formatCompactCurrency(row.endingFundingShortfall)}` : note; return `<tr><th>${row.fiscalYear}</th><td>${formatCurrency(row.totalRevenue)}</td><td>${formatCurrency(row.totalExpenditures)}</td><td class="${row.surplusDeficit < 0 ? 'negative-value' : ''}">${formatSignedCurrency(row.surplusDeficit)}</td><td>${formatRatio(row.coverageRatio)}</td><td>${projection.beginningBalanceProvided ? formatCurrency(row.endingFundBalance) : 'Not provided'}</td><td><span class="runway-status ${status.toLowerCase().replaceAll(' ','-')}">${status}</span>${shortfallNote ? `<small class="status-note">${shortfallNote}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div><details class="outlook-details"><summary>Show Details</summary><div class="table-scroll"><table><thead><tr><th>Fiscal Year</th><th>Tax Revenue</th><th>State Revenue</th><th>Payroll</th><th>Enrollment</th><th>Revenue / Pupil</th><th>Expenditure / Pupil</th><th>Per-Pupil Gap</th><th>New Funding Shortfall</th><th>Shortfall Repaid</th><th>Ending Funding Shortfall</th></tr></thead><tbody>${projection.rows.map((row) => `<tr><th>${row.fiscalYear}</th><td>${formatCurrency(row.propertyTaxRevenue)}</td><td>${formatCurrency(row.stateRevenue)}</td><td>${formatCurrency(row.payroll)}</td><td>${formatNumber(row.enrollment)}</td><td>${formatCurrency(row.revenuePerPupil)}</td><td>${formatCurrency(row.expenditurePerPupil)}</td><td>${formatSignedCurrency(row.perPupilFundingGap)}</td><td>${row.annualFundingShortfall === null ? 'Not provided' : formatCurrency(row.annualFundingShortfall)}</td><td>${row.fundingShortfallReduction === null ? 'Not provided' : formatCurrency(row.fundingShortfallReduction)}</td><td>${row.endingFundingShortfall === null ? 'Not provided' : formatCurrency(row.endingFundingShortfall)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}

function outlookInterpretation(projection, selected) {
  const starting = projection.rows[0];
  const first = projection.firstBalancedYear ? `The first balanced year is ${projection.firstBalancedYear}.` : 'The selected assumption path does not reach operating balance within the projection horizon.';
  const sustained = projection.sustainedRecoveryYear ? `Sustained recovery begins in ${projection.sustainedRecoveryYear} under the selected assumption path.` : projection.lastYearOnlyBalance ? 'Sustained recovery is not confirmed within the projection horizon.' : 'Sustained recovery is not reached within the projection horizon.';
  let balance = 'Beginning available fund balance was not provided.';
  if (projection.beginningBalanceProvided && projection.firstBalancedYear) {
    const firstBalanceRow = projection.rows.find((row) => row.fiscalYear === projection.firstBalancedYear);
    balance = projection.fundBalanceDepletedBeforeFirstBalance ? `Available fund balance is depleted before recovery; the first balanced-year surplus repays ${formatCompactCurrency(firstBalanceRow.fundingShortfallReduction)} of outstanding shortfall before rebuilding ${formatCompactCurrency(firstBalanceRow.endingFundBalance)} of available balance.` : 'Available fund balance remains available through first balance.';
  }
  else if (projection.beginningBalanceProvided) balance = projection.rows.at(-1).endingFundBalance > 0 ? 'Available fund balance remains through the projection horizon.' : 'Available fund balance is depleted within the projection horizon.';
  return `${selected.label} begins with an estimated ${formatCompactCurrency(Math.abs(starting.surplusDeficit))} operating ${starting.surplusDeficit < 0 ? 'deficit' : 'surplus'}. ${first} ${sustained} ${balance} These results are scenario-based and are not a forecast or rating opinion.`;
}

function captureOutlookInputs() {
  const rawBalance = document.querySelector('#beginningBalance').value;
  state.runway.beginningBalance = rawBalance === '' ? null : Number(rawBalance);
  state.runway.fiscalYear = document.querySelector('#fiscalYear').value;
  state.runway.assumptionSetName = document.querySelector('#assumptionSetName').value;
  state.runway.sourceType = document.querySelector('#sourceType').value;
  state.runway.sourceNote = document.querySelector('#sourceNote').value;
  state.runway.threshold = Number(document.querySelector('#runwayThreshold').value) / 100;
  document.querySelectorAll('[data-path-index]').forEach((input) => { state.runway.annualPath[Number(input.dataset.pathIndex)][input.dataset.pathKey] = Number(input.value) / 100; });
  document.querySelectorAll('[data-apply-all]').forEach((input) => { state.runway.applyAll[input.dataset.applyAll] = Number(input.value) / 100; });
}

function bindOutlookControls() {
  const rerender = () => { captureOutlookInputs(); renderRunway(document.querySelector('#content')); };
  ['fiscalYear','assumptionSetName','sourceType','sourceNote','beginningBalance','runwayThreshold'].forEach((id) => document.querySelector(`#${id}`).addEventListener('change', rerender));
  document.querySelectorAll('[data-path-index]').forEach((input) => input.addEventListener('change', rerender));
  document.querySelector('#runwayHorizon').addEventListener('change', () => { captureOutlookInputs(); state.runway.horizon = Number(document.querySelector('#runwayHorizon').value); state.runway.annualPath = resizeAnnualPath(state.runway.annualPath, state.runway.horizon); renderRunway(document.querySelector('#content')); });
  document.querySelector('#useIllustrative').addEventListener('click', () => { state.runway.beginningBalance = 500_000_000; renderRunway(document.querySelector('#content')); });
  document.querySelector('#useSelectedScenario').addEventListener('click', () => { captureOutlookInputs(); state.runway.activeSource = 'selected'; renderRunway(document.querySelector('#content')); });
  document.querySelector('#useAdoptedBudget').addEventListener('click', () => { captureOutlookInputs(); state.runway.activeSource = 'adopted'; renderRunway(document.querySelector('#content')); });
  document.querySelector('#resetAnnualPath').addEventListener('click', () => { state.runway.annualPath = createAnnualPath(state.runway.horizon); state.runway.applyAll = { ...DEFAULT_ANNUAL_ASSUMPTIONS }; renderRunway(document.querySelector('#content')); });
  document.querySelector('#applyAllYears').addEventListener('click', () => { captureOutlookInputs(); state.runway.annualPath = createAnnualPath(state.runway.horizon, state.runway.applyAll); renderRunway(document.querySelector('#content')); });
}

function drawOutlookCharts(projection) {
  state.charts.forEach((chart) => chart.destroy());
  const commonOptions = chartOptions((value) => `$${value}M`);
  state.charts = [new Chart(document.querySelector('#outlookResultChart'), { type:'bar', data:{ labels:projection.rows.map((row)=>row.fiscalYear), datasets:[{ data:projection.rows.map((row)=>row.surplusDeficit/1e6), backgroundColor:projection.rows.map((row)=>row.surplusDeficit>=0?'#398260':'#c55445'), borderRadius:4 }] }, options:{ ...commonOptions, scales:{ ...commonOptions.scales, y:{ ...commonOptions.scales.y, beginAtZero:true } }, plugins:{ ...commonOptions.plugins, tooltip:{ callbacks:{ afterLabel:(context)=>{ const year=projection.rows[context.dataIndex].fiscalYear; if(year===projection.sustainedRecoveryYear)return 'Sustained Recovery Year'; if(year===projection.firstBalancedYear)return 'First Balanced Year'; return ''; } } } } } })];
  if (projection.beginningBalanceProvided) state.charts.push(new Chart(document.querySelector('#outlookFundChart'), { type:'line', data:{ labels:projection.rows.map((row)=>row.fiscalYear), datasets:[{ label:'Available Ending Fund Balance', data:projection.rows.map((row)=>row.endingFundBalance/1e6), borderColor:'#174e78', backgroundColor:'rgba(23,78,120,.12)', fill:true, tension:.15 },{ label:'Analytical Threshold', data:projection.rows.map((row)=>row.thresholdAmount/1e6), borderColor:'#c3871c', borderDash:[6,4], pointRadius:0 },{ label:'Outstanding Funding Shortfall', data:projection.rows.map((row)=>row.endingFundingShortfall/1e6), borderColor:'#bd3d42', backgroundColor:'rgba(189,61,66,.1)', fill:true, tension:.15 }] }, options:{ ...commonOptions, plugins:{ legend:{ display:true, position:'bottom', labels:{ boxWidth:10, usePointStyle:true } } }, scales:{ ...commonOptions.scales, y:{ ...commonOptions.scales.y, beginAtZero:true } } } }));
}

function renderBreakEven(container) {
  const assumptions = { ...ADOPTED_ASSUMPTIONS, ...state.breakEven };
  const taxResult = requiredTaxGrowth(state.baseline, assumptions);
  const workforceResult = requiredWorkforceAdjustment(state.baseline, assumptions);
  const matrix = buildBreakEvenMatrix(state.baseline, { enrollmentChange: state.breakEven.enrollmentChange, compensationChange: state.breakEven.compensationChange });
  const taxGrowths = matrix[0].cells.map((cell) => cell.growth);
  const plausibleTax = taxResult.requiredGrowth >= -0.05 && taxResult.requiredGrowth <= 0.20;
  const plausibleWorkforce = workforceResult.requiredWorkforceChange >= -0.12 && workforceResult.requiredWorkforceChange <= 0.08;
  const anyBalanced = matrix.some((row) => row.cells.some((cell) => cell.surplusDeficit >= 0));
  container.innerHTML = `
    <section class="page-heading"><div><span class="eyebrow">Balanced-budget pathways</span><h2>Break-Even Analysis</h2><p>What combination of property-tax growth and payroll adjustment would allow Dallas ISD to reach a balanced budget?</p></div></section>
    <section class="breakeven-controls panel"><label><span>Tax Growth for Workforce Solver</span><div><input data-break-even="taxGrowth" aria-label="Break-even tax growth" type="number" step="0.1" value="${(state.breakEven.taxGrowth * 100).toFixed(1)}"><b>%</b></div></label><label><span>Average Compensation Growth</span><div><input data-break-even="compensationChange" aria-label="Break-even compensation growth" type="number" step="0.1" value="${(state.breakEven.compensationChange * 100).toFixed(1)}"><b>%</b></div></label><label><span>Student Enrollment Change</span><div><input data-break-even="enrollmentChange" aria-label="Break-even enrollment change" type="number" step="0.1" value="${(state.breakEven.enrollmentChange * 100).toFixed(1)}"><b>%</b></div></label></section>
    <section class="solver-grid"><article class="panel solver-card ${plausibleTax ? '' : 'caution'}"><span class="eyebrow">A · Required tax growth</span><strong>${formatPercent(taxResult.requiredGrowth)}</strong><h3>Appraised-value growth</h3><p>Required tax revenue: ${formatCurrency(taxResult.requiredTaxRevenue)}</p>${plausibleTax ? '<small>Within the displayed heatmap range.</small>' : '<small>Outside the illustrative −5% to +20% range; interpret cautiously.</small>'}</article><article class="panel solver-card ${plausibleWorkforce ? '' : 'caution'}"><span class="eyebrow">B · Required workforce adjustment</span><strong>${formatPercent(workforceResult.requiredWorkforceChange)}</strong><h3>Workforce adjustment</h3><p>Required payroll: ${formatCurrency(workforceResult.requiredPayroll)}</p>${plausibleWorkforce ? '<small>Within the displayed heatmap range.</small>' : '<small>Outside the illustrative −12% to +8% range; interpret cautiously.</small>'}</article><article class="panel solver-card context-card"><span class="eyebrow">Current solver context</span><strong>${formatPercent(state.breakEven.enrollmentChange)}</strong><h3>Enrollment change</h3><p>Compensation growth: ${formatPercent(state.breakEven.compensationChange)}</p><small>State revenue responds through the per-pupil proxy.</small></article></section>
    ${!anyBalanced ? `<div class="model-alert high standalone-alert">${icon('alert')}<div><strong>No displayed combination reaches balance</strong><small>Expand or reconsider the illustrative ranges; this is not a technical error.</small></div></div>` : ''}
    <section class="panel heatmap-panel"><div class="table-heading"><div><span class="eyebrow">C · Break-even heatmap</span><h3>Budget Surplus / Deficit by Tax Growth and Workforce Adjustment</h3><p>Enrollment ${formatPercent(state.breakEven.enrollmentChange)} · Compensation ${formatPercent(state.breakEven.compensationChange)}</p></div><div class="heat-legend"><span><i class="severe"></i>Severe deficit</span><span><i class="deficit"></i>Deficit</span><span><i class="near"></i>Near balance</span><span><i class="surplus"></i>Surplus</span><span><i class="strong-surplus"></i>Strong surplus</span></div></div><div class="heatmap-scroll"><table class="heatmap"><thead><tr><th>Workforce ↓ / Tax Growth →</th>${taxGrowths.map((growth) => `<th>${formatPercent(growth, 0)}</th>`).join('')}</tr></thead><tbody>${matrix.map((row) => `<tr><th>${formatPercent(row.workforceChange, 0)}</th>${row.cells.map((cell) => `<td class="${heatClass(cell.surplusDeficit)}" title="Tax growth ${formatPercent(cell.growth)}, workforce ${formatPercent(cell.workforceChange)}">${formatCompactCurrency(cell.surplusDeficit)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="axis-note">Each cell is calculated by the same multivariable engine. The visual boundary between red/amber and green identifies combinations near balance.</p></section>
    <section class="method-note panel"><div>${icon('info')}</div><div><h3>Interpretation boundary</h3><p>Break-even results are mathematical combinations, not operating recommendations. Values outside the displayed ranges may be economically or operationally unreasonable.</p></div></section>`;
  document.querySelectorAll('[data-break-even]').forEach((input) => input.addEventListener('change', () => { const value = Number(input.value); if (Number.isFinite(value)) state.breakEven[input.dataset.breakEven] = value / 100; renderBreakEven(document.querySelector('#content')); }));
}

function heatClass(value) {
  if (value < -150e6) return 'severe';
  if (value < -25e6) return 'deficit';
  if (value < 25e6) return 'near';
  if (value < 100e6) return 'surplus';
  return 'strong-surplus';
}

function renderRisks(container) {
  const overview = overviewMetrics(state.baseline);
  const scenarios = calculateScenarios(state.baseline, [state.currentScenario]);
  const balanced = scenarios.filter((scenario) => scenario.surplusDeficit >= 0);
  const declineCostRigidity = scenarios.filter((scenario) => scenario.enrollmentChange < 0 && scenario.expenditurePerPupil > scenario.adoptedReference.expenditurePerPupil);
  const risks = [
    { title: 'Property-tax concentration', value: formatPercent(overview.propertyTaxConcentration), tone: overview.propertyTaxConcentration > 0.75 ? 'high' : 'moderate', detail: 'Current-year property taxes as a share of local/intermediate revenue.' },
    { title: 'Payroll concentration', value: formatPercent(overview.payrollConcentration), tone: overview.payrollConcentration > 0.75 ? 'high' : 'moderate', detail: 'Base payroll as a share of adopted GF expenditures.' },
    { title: 'Recapture concentration', value: formatPercent(overview.recaptureConcentration), tone: 'moderate', detail: `${formatCurrency(state.baseline.recapture)} of WADA purchase expenditures.` },
    { title: 'Baseline budget position', value: formatSignedCurrency(overview.surplusDeficit), tone: overview.surplusDeficit < 0 ? 'high' : 'low', detail: 'Adopted GF revenue less expenditures.' },
    { title: 'Balanced scenario check', value: balanced.length ? 'Reached' : 'Not reached', tone: balanced.length ? 'low' : 'high', detail: balanced.length ? 'The Selected Scenario reaches balance.' : 'The Selected Scenario does not reach balance.' },
    { title: 'Enrollment cost rigidity', value: declineCostRigidity.length ? 'Triggered' : 'Not triggered', tone: declineCostRigidity.length ? 'high' : 'low', detail: declineCostRigidity.length ? 'Enrollment falls while expenditure per pupil rises.' : 'The Selected Scenario does not trigger this indicator.' },
  ];
  container.innerHTML = `<section class="page-heading"><div><span class="eyebrow">Automated screening</span><h2>Key fiscal risk drivers</h2><p>Rule-based observations derived only from the loaded workbook and Selected Scenario.</p></div></section><section class="risk-grid">${risks.map((risk) => `<article class="panel risk-card"><div class="risk-top"><span class="risk-dot ${risk.tone}"></span><span>${risk.tone === 'high' ? 'Elevated' : risk.tone === 'moderate' ? 'Monitor' : 'Supportive'}</span></div><h3>${risk.title}</h3><strong>${risk.value}</strong><p>${risk.detail}</p></article>`).join('')}</section><section class="method-note panel"><div>${icon('shield')}</div><div><h3>Evidence boundary</h3><p>These indicators identify arithmetic concentrations, sensitivity and coverage gaps. They are not ratings, forecasts or investment recommendations.</p></div></section>`;
}

function renderMethodology(container) {
  const items = [
    ['Data source', 'Required FY26 values are extracted by normalized row labels and nearby column headers from the uploaded Dallas ISD workbook.'],
    ['Property-tax calculation', 'Adopted current-year tax revenue is divided by 1.05 to infer a pre-growth base, then multiplied by one plus scenario appraised-value growth. Other local revenue remains fixed.'],
    ['Payroll calculation', 'Scenario payroll equals base payroll × (1 + workforce adjustment) × (1 + average compensation growth).'],
    ['Enrollment / state-funding proxy', 'Base state revenue per pupil is multiplied by scenario enrollment. Federal revenue remains fixed; enrollment does not change property-tax revenue.'],
    ['Fixed-cost assumption', 'Non-payroll expenditures remain constant. Enrollment does not automatically reduce staffing; workforce must be adjusted separately.'],
    ['Operating-result bridge', 'Property-tax, state-funding and inverse payroll impacts add to the change in operating result versus the Adopted Budget, with a $1 reconciliation tolerance.'],
    ['Break-even calculation', 'The model algebraically solves either required appraised-value growth or required workforce adjustment, then shows combinations through the shared calculation engine.'],
    ['Official vs. illustrative assumptions', 'The 5% property-tax growth assumption and adopted payroll and enrollment settings reproduce the official FY2026 Adopted Budget. Alternative guided selections are illustrative assumptions, not forecasts.'],
    ['Outlook starting point', 'Multi-Year Fiscal Outlook starts from either the FY2026 Adopted Budget or the active Selected Scenario without modifying Scenario Analysis.'],
    ['Annual path and compounding', 'Future-year property-tax, workforce, compensation and enrollment changes compound from the immediately preceding year. Other local revenue, federal revenue, state revenue per pupil and non-payroll expenditures remain fixed at starting-point amounts.'],
    ['Recovery definitions', 'First Balanced Year is the first non-negative operating result. Sustained Recovery Year requires two consecutive years with non-negative results and coverage of at least 1.00x. Recovery depends entirely on the selected assumptions.'],
    ['Fund balance and funding shortfall', 'Net position subtracts beginning funding shortfall before adding the annual operating result. A surplus repays outstanding shortfall before rebuilding available fund balance, so the two ending positions cannot both be positive. Fund balance does not necessarily equal cash liquidity.'],
    ['External model inputs', 'Annual paths may reflect official planning documents, analyst forecasts or external model outputs. ARIMA may provide an expected path, Monte Carlo a selected percentile path, and GARCH downside assumptions; VaR is not itself a budget forecast. Official Projection remains a user-classified source.'],
    ['Model limitations', 'User-entered paths are not independently validated. The model omits tax-rate changes, weighted attendance, detailed recapture behavior, financing, cash-flow timing and the complete Texas school finance formula.'],
  ];
  container.innerHTML = `<section class="page-heading"><div><span class="eyebrow">Model governance</span><h2>Methodology</h2><p>Transparent definitions, assumptions and limits for responsible interpretation.</p></div></section><section class="methodology-grid">${items.map(([title, detail], index) => `<article class="panel methodology-card"><span>${String(index + 1).padStart(2, '0')}</span><div><h3>${title}</h3><p>${detail}</p></div></article>`).join('')}</section>
    <section class="methodology-extension-grid"><article class="panel methodology-deep-dive"><span class="eyebrow">Multi-Year Fiscal Outlook</span><h3>Financial flexibility until recovery</h3><p>The annual assumption path drives a compounded fiscal trajectory. Beginning available fund balance is optional; the analytical threshold is user-selected and is not Dallas ISD policy. Funding shortfall is reported separately after available balance reaches zero.</p></article><article class="panel methodology-deep-dive"><span class="eyebrow">Guided Scenario Analysis</span><h3>One transparent starting scenario</h3><p>The analyst selects one property-tax, payroll and enrollment assumption. The resulting operating position can become the Outlook starting point and remains compared with the Adopted Budget through a reconciled bridge.</p></article></section>
    <section class="proxy-note panel"><div>${icon('alert')}</div><div><h3>State-funding proxy</h3><p>State revenue response is estimated using a proportional per-pupil funding proxy. This simplified relationship does not replicate the complete Texas school finance formula, weighted attendance calculations, recapture rules, or other funding adjustments.</p></div></section><section class="disclaimer-panel panel"><span class="eyebrow">Required interpretation</span><h3>This is a scenario-analysis tool, not a forecast.</h3><p>User-entered paths are not independently validated, and Official Projection is a user-classified source. The analysis does not produce an official credit rating or investment recommendation.</p></section>`;
}

function formatFileSize(bytes) { return Number.isFinite(bytes) ? (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`) : 'Size unavailable'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

shell();
