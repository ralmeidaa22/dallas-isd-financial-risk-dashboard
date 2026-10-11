export const REQUIRED_SHEETS = [
  'Budget Summary',
  'GF Revenue',
  'GF Expenditures',
  'Other Funds',
  'Enrollment',
  'Scenario Analysis',
  'Financial Ratios',
];

export const METRIC_DEFINITIONS = {
  propertyTaxRevenue: {
    name: 'FY26 current-year property tax revenue',
    sheet: 'GF Revenue',
    labels: ['Taxes - Current Year', 'Taxes Current Year'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  localRevenue: {
    name: 'FY26 total local/intermediate revenue',
    sheet: 'GF Revenue',
    labels: ['Total Local/Intermediate Revenue'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  stateRevenue: {
    name: 'FY26 total state program revenue',
    sheet: 'GF Revenue',
    labels: ['Total State Program Revenue'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  federalRevenue: {
    name: 'FY26 total federal program revenue',
    sheet: 'GF Revenue',
    labels: ['Total Federal Program Revenue'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  totalRevenue: {
    name: 'FY26 total General Fund revenue',
    sheet: 'GF Revenue',
    labels: ['TOTAL GENERAL FUND REVENUE'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  totalExpenditures: {
    name: 'FY26 total General Fund expenditures',
    sheet: 'GF Expenditures',
    labels: ['TOTAL GENERAL FUND EXPENDITURES'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  enrollment: {
    name: 'FY26 projected enrollment',
    sheet: 'Enrollment',
    labels: ['TOTAL ALL CAMPUSES'],
    headers: ['FY26 Projected Enrollment'],
    required: true,
  },
  payroll: {
    name: 'FY26 payroll costs',
    sheet: 'GF Expenditures',
    labels: ['Payroll Costs'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  recapture: {
    name: 'FY26 WADA/recapture expenditure',
    sheet: 'GF Expenditures',
    labels: ['WADA Purchase (Recapture)', 'WADA Purchase Recapture'],
    headers: ['FY26 Adopted'],
    required: true,
  },
  budgetSummaryExpenditures: {
    name: 'Budget Summary GF expenditures cross-check',
    sheet: 'Budget Summary',
    labels: ['Total Expenditures'],
    headers: ['General Operating'],
    required: false,
  },
};

// Mapping is deliberately label-based. Case, repeated whitespace, punctuation and
// line breaks are removed before comparison; positions such as D6/E24 are never used.
export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function labelsMatch(actual, candidates) {
  const normalized = normalizeLabel(actual);
  if (!normalized) return false;
  return candidates.some((candidate) => {
    const target = normalizeLabel(candidate);
    return normalized === target || normalized.includes(target);
  });
}

function asFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[$,%(),\s]/g, '').replace(/,/g, '');
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  const number = Number(cleaned);
  return value.includes('(') ? -number : number;
}

function locateLabel(rows, labels) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < rows[rowIndex].length; columnIndex += 1) {
      if (labelsMatch(rows[rowIndex][columnIndex], labels)) return { rowIndex, columnIndex };
    }
  }
  return null;
}

function locateHeaderColumn(rows, labelRow, headers) {
  // The closest matching header above the label wins. This matters on sheets with
  // multiple tables whose FY26 column positions differ (e.g. GF Expenditures).
  for (let rowIndex = labelRow - 1; rowIndex >= 0; rowIndex -= 1) {
    for (let columnIndex = 0; columnIndex < rows[rowIndex].length; columnIndex += 1) {
      if (labelsMatch(rows[rowIndex][columnIndex], headers)) return { rowIndex, columnIndex };
    }
  }
  return null;
}

export function extractMetric(rows, definition) {
  const label = locateLabel(rows, definition.labels);
  if (!label) return { value: null, error: `Label not found: ${definition.labels[0]}` };
  const header = locateHeaderColumn(rows, label.rowIndex, definition.headers);
  if (!header) return { value: null, error: `Header not found: ${definition.headers[0]}` };
  const value = asFiniteNumber(rows[label.rowIndex]?.[header.columnIndex]);
  if (value === null) {
    return { value: null, error: `Non-numeric value at label “${definition.labels[0]}” and header “${definition.headers[0]}”` };
  }
  return {
    value,
    location: { row: label.rowIndex + 1, column: header.columnIndex + 1 },
  };
}

export function mapMetrics(sheetRows) {
  return Object.fromEntries(
    Object.entries(METRIC_DEFINITIONS).map(([key, definition]) => {
      const rows = sheetRows[definition.sheet];
      return [key, rows ? extractMetric(rows, definition) : { value: null, error: `Sheet not found: ${definition.sheet}` }];
    }),
  );
}
