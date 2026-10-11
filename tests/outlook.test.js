import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADOPTED_ASSUMPTIONS, calculateScenario, getBaseline } from '../src/lib/calculations.js';
import { parseWorkbook } from '../src/lib/workbook.js';
import { buildMultiYearOutlook, createAnnualPath, DEFAULT_ANNUAL_ASSUMPTIONS, resizeAnnualPath, validateOutlookInputs } from '../src/lib/runway.js';

const buffer = readFileSync(new URL('../src/assets/Dallas-ISD-Budget-Public.xlsx', import.meta.url));
const baseline = getBaseline(parseWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)).metrics);
const adopted = calculateScenario(baseline, ADOPTED_ASSUMPTIONS);
const selectedAssumptions = { growth: -0.02, workforceChange: 0, compensationChange: 0.05, enrollmentChange: -0.05 };
const selected = calculateScenario(baseline, selectedAssumptions);
const project = (options = {}) => buildMultiYearOutlook({ startingScenario: adopted, startingFiscalYear: 'FY2026', horizon: 5, annualPath: createAnnualPath(5), threshold: 0.10, beginningBalance: null, ...options });

describe('Multi-Year Fiscal Outlook', () => {
  it('loads Adopted Budget exactly as the starting point', () => {
    const row = project().rows[0];
    expect(row.totalRevenue).toBe(1_754_690_579);
    expect(row.totalExpenditures).toBe(1_883_564_247);
    expect(row.surplusDeficit).toBe(-128_873_668);
    expect(row.coverageRatio).toBeCloseTo(0.93157989264, 10);
  });

  it('loads Selected Scenario without modifying it', () => {
    const snapshot = { ...selected };
    const row = project({ startingScenario: selected }).rows[0];
    expect(row.propertyTaxRevenue).toBe(selected.propertyTaxRevenue);
    expect(row.stateRevenue).toBe(selected.stateRevenue);
    expect(row.payroll).toBe(selected.payroll);
    expect(row.enrollment).toBe(selected.enrollment);
    expect(selected).toEqual(snapshot);
  });

  it('creates and resizes the default annual path for 3, 5 and 7 years', () => {
    expect(createAnnualPath()).toHaveLength(5);
    expect(createAnnualPath()[0]).toEqual(DEFAULT_ANNUAL_ASSUMPTIONS);
    expect(resizeAnnualPath(createAnnualPath(3), 7)).toHaveLength(7);
    expect(resizeAnnualPath(createAnnualPath(7), 3)).toHaveLength(3);
  });

  it('compounds property tax annually while fixed revenue components remain constant', () => {
    const outlook = project();
    expect(outlook.rows[1].propertyTaxRevenue).toBeCloseTo(adopted.propertyTaxRevenue * 1.05, 5);
    expect(outlook.rows[2].propertyTaxRevenue).toBeCloseTo(adopted.propertyTaxRevenue * 1.05 ** 2, 5);
    expect(outlook.rows.every((row) => row.otherLocalRevenue === adopted.otherLocalRevenue)).toBe(true);
    expect(outlook.rows.every((row) => row.federalRevenue === adopted.federalRevenue)).toBe(true);
    expect(outlook.rows.every((row) => row.nonPayrollExpenditures === adopted.totalExpenditures - adopted.payroll)).toBe(true);
  });

  it('compounds enrollment and calculates state revenue with a fixed per-pupil proxy', () => {
    const path = createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, enrollmentChange: -0.05 });
    const outlook = project({ annualPath: path });
    expect(outlook.rows[2].enrollment).toBeCloseTo(adopted.enrollment * 0.95 ** 2, 6);
    expect(outlook.rows[2].stateRevenue).toBeCloseTo(outlook.stateRevenuePerPupil * outlook.rows[2].enrollment, 5);
  });

  it('compounds workforce and compensation changes into payroll', () => {
    const assumptions = { ...DEFAULT_ANNUAL_ASSUMPTIONS, workforceChange: -0.02, compensationChange: 0.03 };
    const outlook = project({ annualPath: createAnnualPath(5, assumptions) });
    expect(outlook.rows[2].payroll).toBeCloseTo(adopted.payroll * (0.98 * 1.03) ** 2, 5);
    expect(outlook.rows[2].totalExpenditures).toBeCloseTo(outlook.rows[2].payroll + outlook.fixed.nonPayrollExpenditures, 5);
    expect(outlook.rows[2].surplusDeficit).toBeCloseTo(outlook.rows[2].totalRevenue - outlook.rows[2].totalExpenditures, 5);
  });

  it('detects first balance and two-year sustained recovery', () => {
    const outlook = project();
    expect(outlook.firstBalancedYear).toBe('FY2028');
    expect(outlook.sustainedRecoveryYear).toBe('FY2028');
  });

  it('handles no balance and last-year-only unconfirmed recovery', () => {
    const noBalance = project({ annualPath: createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 }) });
    expect(noBalance.firstBalancedYear).toBeNull();
    expect(noBalance.sustainedRecoveryYear).toBeNull();
    const lastOnly = project({ annualPath: [
      ...createAnnualPath(4, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 }),
      { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0.08 },
    ] });
    expect(lastOnly.firstBalancedYear).toBeNull();
    const forcedLast = project({ annualPath: [
      ...createAnnualPath(4, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 }),
      { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0.10 },
    ] });
    expect(forcedLast.firstBalancedYear).toBe('FY2031');
    expect(forcedLast.sustainedRecoveryYear).toBeNull();
    expect(forcedLast.lastYearOnlyBalance).toBe(true);
  });

  it('allows beginning fund balance to remain blank', () => {
    const outlook = project();
    expect(outlook.validation.valid).toBe(true);
    expect(outlook.rows[0].endingFundBalance).toBeNull();
    expect(outlook.firstBalancedYear).toBe('FY2028');
  });

  it('never makes available fund balance or its ratio negative', () => {
    const outlook = project({ beginningBalance: 50e6, annualPath: createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 }) });
    expect(outlook.rows.every((row) => row.endingFundBalance >= 0)).toBe(true);
    expect(outlook.rows.every((row) => row.fundBalanceRatio >= 0)).toBe(true);
    expect(outlook.rows[0].endingFundBalance).toBe(0);
  });

  it('starts funding shortfall at depletion and accumulates without double subtraction', () => {
    const outlook = project({ beginningBalance: 200e6, annualPath: createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 }) });
    expect(outlook.rows[0].annualFundingShortfall).toBe(0);
    expect(outlook.rows[1].endingFundBalance).toBe(0);
    expect(outlook.rows[1].annualFundingShortfall).toBeCloseTo(57_747_336, 5);
    expect(outlook.rows[2].annualFundingShortfall).toBeCloseTo(128_873_668, 5);
    expect(outlook.rows[2].endingFundingShortfall).toBeCloseTo(57_747_336 + 128_873_668, 5);
    expect(outlook.fundBalanceDepletedBeforeFirstBalance).toBe(true);
  });

  it('uses a surplus to repay outstanding shortfall before rebuilding available fund balance', () => {
    const path = createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, growth: 0 });
    path[3].growth = 0.10;
    path[4].growth = 0.05;
    const outlook = project({ beginningBalance: 500e6, annualPath: path });
    const fy2029 = outlook.rows.find((row) => row.fiscalYear === 'FY2029');
    const fy2030 = outlook.rows.find((row) => row.fiscalYear === 'FY2030');
    expect(fy2029.endingFundingShortfall).toBeCloseTo(15_494_672, 5);
    expect(fy2030.beginningFundingShortfall).toBeCloseTo(15_494_672, 5);
    expect(fy2030.surplusDeficit).toBeCloseTo(19_616_829.6, 5);
    expect(fy2030.fundingShortfallReduction).toBeCloseTo(15_494_672, 5);
    expect(fy2030.endingFundingShortfall).toBe(0);
    expect(fy2030.endingFundBalance).toBeCloseTo(4_122_157.6, 5);
    expect(outlook.fundBalanceAtFirstBalance).toBeCloseTo(4_122_157.6, 5);
    expect(outlook.rows.every((row) => !(row.endingFundBalance > 0 && row.endingFundingShortfall > 0))).toBe(true);
  });

  it('recalculates analytical threshold from each year expenditures', () => {
    const path = createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, compensationChange: 0.03 });
    const outlook = project({ annualPath: path, beginningBalance: 500e6, threshold: 0.10 });
    expect(outlook.rows[1].thresholdAmount).toBeCloseTo(outlook.rows[1].totalExpenditures * 0.10, 5);
    expect(outlook.rows[2].thresholdAmount).toBeGreaterThan(outlook.rows[1].thresholdAmount);
  });

  it('rejects impossible annual assumptions and invalid fiscal years', () => {
    const invalid = validateOutlookInputs({ startingScenario: adopted, startingFiscalYear: '2026', horizon: 5, threshold: 0.10, beginningBalance: null, annualPath: createAnnualPath(5) });
    expect(invalid.valid).toBe(false);
    const impossible = project({ annualPath: createAnnualPath(5, { ...DEFAULT_ANNUAL_ASSUMPTIONS, enrollmentChange: -1.01 }) });
    expect(impossible.validation.valid).toBe(false);
  });
});
