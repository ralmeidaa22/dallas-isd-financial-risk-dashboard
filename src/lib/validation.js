import { METRIC_DEFINITIONS, REQUIRED_SHEETS } from './mapping.js';

const near = (left, right, tolerance = 1) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

export function validateWorkbook(parsed) {
  const detectedSheets = REQUIRED_SHEETS.filter((sheet) => parsed.sheetNames.includes(sheet));
  const missingSheets = REQUIRED_SHEETS.filter((sheet) => !parsed.sheetNames.includes(sheet));
  const metricEntries = Object.entries(METRIC_DEFINITIONS);
  const foundMetrics = metricEntries
    .filter(([key]) => Number.isFinite(parsed.metrics[key]?.value))
    .map(([key, definition]) => ({ key, name: definition.name, value: parsed.metrics[key].value }));
  const missingMetrics = metricEntries
    .filter(([key, definition]) => definition.required && !Number.isFinite(parsed.metrics[key]?.value))
    .map(([key, definition]) => ({ key, name: definition.name, error: parsed.metrics[key]?.error }));

  const m = parsed.metrics;
  const revenueComponents = ['localRevenue', 'stateRevenue', 'federalRevenue'].map((key) => m[key]?.value);
  const revenueReconciliation = revenueComponents.every(Number.isFinite)
    ? {
        calculated: revenueComponents.reduce((sum, value) => sum + value, 0),
        reported: m.totalRevenue?.value,
        pass: near(revenueComponents.reduce((sum, value) => sum + value, 0), m.totalRevenue?.value),
      }
    : { calculated: null, reported: m.totalRevenue?.value, pass: false };

  const expenditureReconciliation = {
    calculated: m.budgetSummaryExpenditures?.value ?? null,
    reported: m.totalExpenditures?.value ?? null,
    pass: near(m.budgetSummaryExpenditures?.value, m.totalExpenditures?.value),
  };

  const status = missingSheets.length || missingMetrics.length
    ? 'Error'
    : revenueReconciliation.pass && expenditureReconciliation.pass
      ? 'Ready'
      : 'Warning';
  return {
    status,
    detectedSheets,
    missingSheets,
    foundMetrics,
    missingMetrics,
    revenueReconciliation,
    expenditureReconciliation,
  };
}
