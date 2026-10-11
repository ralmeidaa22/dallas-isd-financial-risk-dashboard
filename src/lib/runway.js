import { safeDivide } from './calculations.js';

export const DEFAULT_OUTLOOK_HORIZON = 5;
export const DEFAULT_ANALYTICAL_THRESHOLD = 0.10;
export const DEFAULT_ANNUAL_ASSUMPTIONS = Object.freeze({
  growth: 0.05,
  workforceChange: 0,
  compensationChange: 0,
  enrollmentChange: 0,
});

export function parseFiscalYear(value) {
  const match = String(value).trim().match(/^FY\s?(\d{4})$/i);
  return match ? Number(match[1]) : null;
}

export function createAnnualPath(horizon = DEFAULT_OUTLOOK_HORIZON, assumptions = DEFAULT_ANNUAL_ASSUMPTIONS) {
  return Array.from({ length: horizon }, () => ({ ...assumptions }));
}

export function resizeAnnualPath(path, horizon, assumptions = DEFAULT_ANNUAL_ASSUMPTIONS) {
  return Array.from({ length: horizon }, (_, index) => ({ ...(path[index] ?? assumptions) }));
}

export function validateOutlookInputs({ startingScenario, startingFiscalYear, horizon, threshold, beginningBalance, annualPath }) {
  const errors = [];
  const warnings = [];
  if (!startingScenario || ['propertyTaxRevenue', 'otherLocalRevenue', 'stateRevenue', 'federalRevenue', 'totalRevenue', 'enrollment', 'payroll', 'totalExpenditures'].some((key) => !Number.isFinite(startingScenario?.[key]) || startingScenario[key] < 0)) errors.push('A valid non-negative starting scenario is required.');
  if (!parseFiscalYear(startingFiscalYear)) errors.push('Starting fiscal year must use a format such as FY2026.');
  if (![3, 5, 7].includes(horizon)) errors.push('Projection horizon must be 3, 5 or 7 years.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) errors.push('Analytical threshold must be between 0% and 100%.');
  if (beginningBalance !== null && (!Number.isFinite(beginningBalance) || beginningBalance < 0)) errors.push('Beginning available fund balance must be blank or non-negative.');
  if (!Array.isArray(annualPath) || annualPath.length !== horizon) errors.push('Annual assumption path must match the projection horizon.');
  annualPath?.forEach((year, index) => {
    for (const key of ['growth', 'workforceChange', 'compensationChange', 'enrollmentChange']) {
      if (!Number.isFinite(year[key]) || year[key] < -1) errors.push(`Year ${index + 1} ${key} must be numeric and cannot be below -100%.`);
    }
  });
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings };
}

function fiscalRow(values, fiscalYear, assumptions = null) {
  const revenuePerPupil = safeDivide(values.totalRevenue, values.enrollment);
  const expenditurePerPupil = safeDivide(values.totalExpenditures, values.enrollment);
  return {
    ...values,
    assumptions,
    fiscalYear,
    surplusDeficit: values.totalRevenue - values.totalExpenditures,
    coverageRatio: safeDivide(values.totalRevenue, values.totalExpenditures),
    revenuePerPupil,
    expenditurePerPupil,
    perPupilFundingGap: revenuePerPupil === null || expenditurePerPupil === null ? null : revenuePerPupil - expenditurePerPupil,
  };
}

export function buildMultiYearOutlook({
  startingScenario,
  startingFiscalYear = 'FY2026',
  annualPath = createAnnualPath(),
  horizon = annualPath.length,
  beginningBalance = null,
  threshold = DEFAULT_ANALYTICAL_THRESHOLD,
}) {
  const validation = validateOutlookInputs({ startingScenario, startingFiscalYear, horizon, threshold, beginningBalance, annualPath });
  if (!validation.valid) return { validation, rows: [] };
  const startYear = parseFiscalYear(startingFiscalYear);
  const stateRevenuePerPupil = safeDivide(startingScenario.stateRevenue, startingScenario.enrollment) ?? 0;
  const fixed = {
    otherLocalRevenue: startingScenario.otherLocalRevenue,
    federalRevenue: startingScenario.federalRevenue,
    nonPayrollExpenditures: startingScenario.totalExpenditures - startingScenario.payroll,
  };
  const startValues = {
    propertyTaxRevenue: startingScenario.propertyTaxRevenue,
    otherLocalRevenue: fixed.otherLocalRevenue,
    stateRevenue: startingScenario.stateRevenue,
    federalRevenue: fixed.federalRevenue,
    totalRevenue: startingScenario.totalRevenue,
    enrollment: startingScenario.enrollment,
    payroll: startingScenario.payroll,
    nonPayrollExpenditures: fixed.nonPayrollExpenditures,
    totalExpenditures: startingScenario.totalExpenditures,
  };
  const rows = [fiscalRow(startValues, `FY${startYear}`)];
  for (let index = 0; index < horizon; index += 1) {
    const prior = rows.at(-1);
    const assumptions = annualPath[index];
    const propertyTaxRevenue = prior.propertyTaxRevenue * (1 + assumptions.growth);
    const enrollment = prior.enrollment * (1 + assumptions.enrollmentChange);
    const stateRevenue = stateRevenuePerPupil * enrollment;
    const payroll = prior.payroll * (1 + assumptions.workforceChange) * (1 + assumptions.compensationChange);
    const totalRevenue = propertyTaxRevenue + fixed.otherLocalRevenue + stateRevenue + fixed.federalRevenue;
    const totalExpenditures = payroll + fixed.nonPayrollExpenditures;
    const values = { propertyTaxRevenue, otherLocalRevenue: fixed.otherLocalRevenue, stateRevenue, federalRevenue: fixed.federalRevenue, totalRevenue, enrollment, payroll, nonPayrollExpenditures: fixed.nonPayrollExpenditures, totalExpenditures };
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) return { validation: { valid: false, errors: [`FY${startYear + index + 1} assumptions produce an impossible negative or non-finite fiscal value.`], warnings: [] }, rows: [] };
    rows.push(fiscalRow(values, `FY${startYear + index + 1}`, assumptions));
  }

  let availableBalance = beginningBalance;
  let fundingShortfall = 0;
  let cumulativeDeficitBeforeBalance = 0;
  const firstBalancedIndex = rows.findIndex((row) => row.surplusDeficit >= 0);
  const sustainedRecoveryIndex = rows.findIndex((row, index) => index < rows.length - 1 && row.surplusDeficit >= 0 && row.coverageRatio >= 1 && rows[index + 1].surplusDeficit >= 0 && rows[index + 1].coverageRatio >= 1);
  rows.forEach((row, index) => {
    if (firstBalancedIndex === -1 || index < firstBalancedIndex) cumulativeDeficitBeforeBalance += Math.max(0, -row.surplusDeficit);
    const thresholdAmount = row.totalExpenditures * threshold;
    if (beginningBalance === null) {
      Object.assign(row, { beginningFundBalance: null, beginningFundingShortfall: null, netFinancialPosition: null, endingFundBalance: null, endingFundingShortfall: null, fundBalanceRatio: null, thresholdAmount, annualFundingShortfall: null, fundingShortfallReduction: null });
      return;
    }
    const beginningFundBalance = availableBalance;
    const beginningFundingShortfall = fundingShortfall;
    const netFinancialPosition = beginningFundBalance - beginningFundingShortfall + row.surplusDeficit;
    const endingFundBalance = Math.max(0, netFinancialPosition);
    const endingFundingShortfall = Math.max(0, -netFinancialPosition);
    const annualFundingShortfall = Math.max(0, endingFundingShortfall - beginningFundingShortfall);
    const fundingShortfallReduction = Math.max(0, beginningFundingShortfall - endingFundingShortfall);
    availableBalance = endingFundBalance;
    fundingShortfall = endingFundingShortfall;
    Object.assign(row, { beginningFundBalance, beginningFundingShortfall, netFinancialPosition, endingFundBalance, endingFundingShortfall, fundBalanceRatio: safeDivide(endingFundBalance, row.totalExpenditures), thresholdAmount, annualFundingShortfall, fundingShortfallReduction });
  });
  const firstBalancedRow = firstBalancedIndex >= 0 ? rows[firstBalancedIndex] : null;
  const fundBalanceDepletedBeforeFirstBalance = beginningBalance !== null && rows.some((row, index) => row.endingFundBalance === 0 && (firstBalancedIndex === -1 || index < firstBalancedIndex));
  return {
    validation,
    rows,
    firstBalancedYear: firstBalancedRow?.fiscalYear ?? null,
    sustainedRecoveryYear: sustainedRecoveryIndex >= 0 ? rows[sustainedRecoveryIndex].fiscalYear : null,
    lastYearOnlyBalance: firstBalancedIndex === rows.length - 1,
    cumulativeDeficitBeforeBalance,
    fundBalanceAtFirstBalance: beginningBalance === null ? null : firstBalancedRow?.endingFundBalance ?? null,
    fundBalanceDepletedBeforeFirstBalance,
    minimumCoverageRatio: Math.min(...rows.map((row) => row.coverageRatio)),
    beginningBalanceProvided: beginningBalance !== null,
    stateRevenuePerPupil,
    fixed,
  };
}
