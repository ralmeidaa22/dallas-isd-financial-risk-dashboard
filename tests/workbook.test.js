import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADOPTED_ASSUMPTIONS,
  buildBreakEvenMatrix,
  calculateScenario,
  calculateScenarios,
  GUIDED_ASSUMPTIONS,
  getBaseline,
  matchGuidedAssumptions,
  requiredTaxGrowth,
  requiredWorkforceAdjustment,
} from '../src/lib/calculations.js';
import { parseWorkbook } from '../src/lib/workbook.js';
import { validateWorkbook } from '../src/lib/validation.js';

const workbookPath = new URL('../src/assets/Dallas-ISD-Budget-Public.xlsx', import.meta.url);
const buffer = readFileSync(workbookPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const parsed = parseWorkbook(arrayBuffer);

describe('Dallas ISD workbook mapping', () => {
  it('recognizes all required sheets and metrics', () => {
    const validation = validateWorkbook(parsed);
    expect(validation.status).toBe('Ready');
    expect(validation.detectedSheets).toHaveLength(7);
    expect(validation.missingSheets).toEqual([]);
    expect(validation.missingMetrics).toEqual([]);
    expect(validation.revenueReconciliation.pass).toBe(true);
    expect(validation.expenditureReconciliation.pass).toBe(true);
  });

  it('maps FY26 values by labels and headers', () => {
    const values = Object.fromEntries(Object.entries(parsed.metrics).map(([key, result]) => [key, result.value]));
    expect(values.propertyTaxRevenue).toBe(1_484_904_976);
    expect(values.localRevenue).toBe(1_540_524_976);
    expect(values.stateRevenue).toBe(166_516_511);
    expect(values.federalRevenue).toBe(47_649_092);
    expect(values.totalRevenue).toBe(1_754_690_579);
    expect(values.totalExpenditures).toBe(1_883_564_247);
    expect(values.enrollment).toBe(139_890);
    expect(values.payroll).toBe(1_464_112_663);
    expect(values.recapture).toBe(104_000_000);
  });
});

describe('Scenario Analysis parity', () => {
  const baseline = getBaseline(parsed.metrics);
  const legacyScenarios = [
    { id: 'stress', growth: -0.02 }, { id: 'bear', growth: 0 }, { id: 'moderate', growth: 0.02 }, { id: 'adopted', growth: 0.05 }, { id: 'bull', growth: 0.08 },
  ].map((scenario) => ({ ...scenario, workforceChange: 0, compensationChange: 0, enrollmentChange: 0 }));
  const results = calculateScenarios(baseline, legacyScenarios);

  it('preserves every original property-tax scenario when operating drivers are zero', () => {
    const expected = {
      stress: [1_655_696_913.9333334, -227_867_333.0666666, 0.8790233285487359],
      bear: [1_683_980_818.2380953, -199_583_428.76190472, 0.8940394897175468],
      moderate: [1_712_264_722.5428572, -171_299_524.45714283, 0.9090556508863577],
      adopted: [1_754_690_579, -128_873_668, 0.931579892639574],
      bull: [1_797_116_435.457143, -86_447_811.54285693, 0.9541041343927904],
    };
    for (const scenario of calculateScenarios(baseline, legacyScenarios)) {
      expect(scenario.totalRevenue).toBeCloseTo(expected[scenario.id][0], 5);
      expect(scenario.surplusDeficit).toBeCloseTo(expected[scenario.id][1], 5);
      expect(scenario.coverageRatio).toBeCloseTo(expected[scenario.id][2], 10);
    }
  });

  it('matches the requested Adopted Base checkpoints', () => {
    const adopted = results.find((result) => result.id === 'adopted');
    expect(adopted.totalRevenue).toBe(1_754_690_579);
    expect(adopted.totalExpenditures).toBe(1_883_564_247);
    expect(adopted.surplusDeficit).toBe(-128_873_668);
    expect(adopted.deficitPercent).toBeCloseTo(-0.073445238461, 10);
    expect(adopted.revenuePerPupil).toBeCloseTo(12_543.359632568, 6);
    expect(adopted.expenditurePerPupil).toBeCloseTo(13_464.609671885, 6);
    expect(adopted.coverageRatio).toBeCloseTo(0.93157989264, 10);
  });

  it('recalculates immediately from a changed growth input', () => {
    const custom = legacyScenarios.map((scenario) => scenario.id === 'stress' ? { ...scenario, growth: -0.03 } : scenario);
    const changed = calculateScenarios(baseline, custom);
    expect(changed[0].totalRevenue).toBeLessThan(results[0].totalRevenue);
    expect(changed[0].coverageRatio).toBeLessThan(results[0].coverageRatio);
  });

  it('raises payroll and worsens deficit when compensation increases', () => {
    const base = calculateScenario(baseline, ADOPTED_ASSUMPTIONS);
    const stressed = calculateScenario(baseline, { ...ADOPTED_ASSUMPTIONS, compensationChange: 0.05 });
    expect(stressed.payroll).toBeGreaterThan(base.payroll);
    expect(stressed.surplusDeficit).toBeLessThan(base.surplusDeficit);
  });

  it('reduces payroll and improves deficit when workforce decreases', () => {
    const base = calculateScenario(baseline, ADOPTED_ASSUMPTIONS);
    const reduced = calculateScenario(baseline, { ...ADOPTED_ASSUMPTIONS, workforceChange: -0.05 });
    expect(reduced.payroll).toBeLessThan(base.payroll);
    expect(reduced.surplusDeficit).toBeGreaterThan(base.surplusDeficit);
  });

  it('reduces estimated state revenue and raises expenditure per pupil when enrollment falls', () => {
    const base = calculateScenario(baseline, ADOPTED_ASSUMPTIONS);
    const decline = calculateScenario(baseline, { ...ADOPTED_ASSUMPTIONS, enrollmentChange: -0.05 });
    expect(decline.stateRevenue).toBeLessThan(base.stateRevenue);
    expect(decline.expenditurePerPupil).toBeGreaterThan(base.expenditurePerPupil);
  });

  it('reconciles additive risk attribution for every default scenario', () => {
    for (const scenario of results) {
      expect(scenario.attributionReconciles).toBe(true);
      expect(scenario.totalExplainedChange).toBeCloseTo(scenario.deficitChangeVsAdopted, 5);
    }
  });

  it('solves required tax growth to a near-zero budget result', () => {
    const result = requiredTaxGrowth(baseline, ADOPTED_ASSUMPTIONS);
    const balanced = calculateScenario(baseline, { ...ADOPTED_ASSUMPTIONS, growth: result.requiredGrowth });
    expect(result.requiredGrowth).toBeCloseTo(0.141, 3);
    expect(balanced.surplusDeficit).toBeCloseTo(0, 2);
  });

  it('solves required workforce adjustment to a near-zero budget result', () => {
    const result = requiredWorkforceAdjustment(baseline, ADOPTED_ASSUMPTIONS);
    const balanced = calculateScenario(baseline, { ...ADOPTED_ASSUMPTIONS, workforceChange: result.requiredWorkforceChange });
    expect(result.requiredWorkforceChange).toBeCloseTo(-0.088, 3);
    expect(balanced.surplusDeficit).toBeCloseTo(0, 2);
  });

  it('builds the heatmap entirely from the calculation engine', () => {
    const matrix = buildBreakEvenMatrix(baseline, { taxGrowths: [0.05, 0.15], workforceChanges: [-0.08, 0] });
    expect(matrix).toHaveLength(2);
    expect(matrix[0].cells).toHaveLength(2);
    expect(matrix[0].cells[1].surplusDeficit).toBeGreaterThan(matrix[1].cells[0].surplusDeficit);
  });
});

describe('Guided Scenario Builder', () => {
  const baseline = getBaseline(parsed.metrics);
  const adopted = calculateScenario(baseline, ADOPTED_ASSUMPTIONS);

  it('exposes exactly four tax, three payroll and three enrollment choices', () => {
    expect(GUIDED_ASSUMPTIONS.propertyTax.map((item) => item.growth)).toEqual([-0.02, 0, 0.05, 0.08]);
    expect(GUIDED_ASSUMPTIONS.payroll.map((item) => [item.workforceChange, item.compensationChange])).toEqual([[0, 0.05], [0, 0], [-0.05, 0]]);
    expect(GUIDED_ASSUMPTIONS.enrollment.map((item) => item.enrollmentChange)).toEqual([-0.05, 0, 0.02]);
  });

  it('matches Adopted Budget as the guided default', () => {
    const match = matchGuidedAssumptions(ADOPTED_ASSUMPTIONS);
    expect(match.tax.id).toBe('tax-adopted');
    expect(match.payroll.id).toBe('payroll-adopted');
    expect(match.enrollment.id).toBe('enrollment-stable');
    expect(adopted.perPupilFundingGap).toBeCloseTo(-921.250039317, 6);
  });

  it('reconciles each guided combination to the three driver impacts', () => {
    for (const tax of GUIDED_ASSUMPTIONS.propertyTax) for (const payroll of GUIDED_ASSUMPTIONS.payroll) for (const enrollment of GUIDED_ASSUMPTIONS.enrollment) {
      const result = calculateScenarios(baseline, [{ ...ADOPTED_ASSUMPTIONS, ...tax, ...payroll, ...enrollment }])[0];
      expect(result.attributionReconciles).toBe(true);
      expect(result.surplusDeficit).toBeCloseTo(result.adoptedReference.surplusDeficit + result.propertyTaxImpact + result.payrollImpact + result.enrollmentStateImpact, 5);
    }
  });

  it('keeps a favorable but still negative upside result below zero', () => {
    const result = calculateScenario(baseline, { growth: 0.08, workforceChange: 0, compensationChange: 0, enrollmentChange: 0.02 });
    expect(result.surplusDeficit).toBeGreaterThan(adopted.surplusDeficit);
    expect(result.surplusDeficit).toBeLessThan(0);
    expect(result.coverageRatio).toBeLessThan(1);
  });
});
