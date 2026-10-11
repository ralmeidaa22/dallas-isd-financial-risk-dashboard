export const ADOPTED_ASSUMPTIONS = {
  growth: 0.05,
  workforceChange: 0,
  compensationChange: 0,
  enrollmentChange: 0,
};

export const GUIDED_ASSUMPTIONS = {
  propertyTax: [
    { id: 'tax-stress', name: 'Stress', growth: -0.02, value: '-2%', description: 'Illustrative tax-base contraction' },
    { id: 'tax-flat', name: 'Flat', growth: 0, value: '0%', description: 'No appraised-value growth' },
    { id: 'tax-adopted', name: 'Adopted Budget', growth: 0.05, value: '5%', description: 'Official FY2026 budget assumption' },
    { id: 'tax-upside', name: 'Upside', growth: 0.08, value: '8%', description: 'Illustrative growth above budget' },
  ],
  payroll: [
    { id: 'payroll-pressure', name: 'Compensation Pressure', workforceChange: 0, compensationChange: 0.05, value: '0% workforce · +5% compensation', description: 'Same staffing level with 5% higher average compensation' },
    { id: 'payroll-adopted', name: 'Adopted Base', workforceChange: 0, compensationChange: 0, value: '0% workforce · 0% compensation', description: 'Payroll remains at the adopted-budget level' },
    { id: 'payroll-workforce', name: 'Workforce Adjustment', workforceChange: -0.05, compensationChange: 0, value: '-5% workforce · 0% compensation', description: 'Illustrative 5% reduction in payroll-supported positions' },
  ],
  enrollment: [
    { id: 'enrollment-decline', name: 'Enrollment Decline', enrollmentChange: -0.05, value: '-5%', description: 'Illustrative decline with state-funding pressure' },
    { id: 'enrollment-stable', name: 'Stable Enrollment', enrollmentChange: 0, value: '0%', description: 'Enrollment remains at the projected level' },
    { id: 'enrollment-growth', name: 'Enrollment Growth', enrollmentChange: 0.02, value: '+2%', description: 'Illustrative moderate enrollment growth' },
  ],
};

export function matchGuidedAssumptions(assumptions) {
  const tax = GUIDED_ASSUMPTIONS.propertyTax.find((option) => option.growth === assumptions.growth) ?? null;
  const payroll = GUIDED_ASSUMPTIONS.payroll.find((option) => option.workforceChange === assumptions.workforceChange && option.compensationChange === assumptions.compensationChange) ?? null;
  const enrollment = GUIDED_ASSUMPTIONS.enrollment.find((option) => option.enrollmentChange === assumptions.enrollmentChange) ?? null;
  return { tax, payroll, enrollment };
}

export function safeDivide(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : null;
}

export function getBaseline(metrics, adoptedGrowth = 0.05) {
  const value = (key) => metrics[key]?.value ?? null;
  const propertyTax = value('propertyTaxRevenue');
  const localRevenue = value('localRevenue');
  const totalExpenditures = value('totalExpenditures');
  const payroll = value('payroll');
  const enrollment = value('enrollment');
  const stateRevenue = value('stateRevenue');
  return {
    adoptedGrowth,
    propertyTax,
    impliedBaseTax: safeDivide(propertyTax, 1 + adoptedGrowth),
    otherLocalRevenue: localRevenue === null || propertyTax === null ? null : localRevenue - propertyTax,
    localRevenue,
    stateRevenue,
    stateRevenuePerPupil: safeDivide(stateRevenue, enrollment),
    federalRevenue: value('federalRevenue'),
    totalRevenue: value('totalRevenue'),
    totalExpenditures,
    enrollment,
    payroll,
    nonPayrollExpenditures: totalExpenditures === null || payroll === null ? null : totalExpenditures - payroll,
    recapture: value('recapture'),
  };
}

export function calculateScenario(baseline, assumptions) {
  const currentYearTaxRevenue = baseline.impliedBaseTax * (1 + assumptions.growth);
  const totalLocalRevenue = currentYearTaxRevenue + baseline.otherLocalRevenue;
  const enrollment = baseline.enrollment * (1 + assumptions.enrollmentChange);
  const stateRevenue = baseline.stateRevenuePerPupil * enrollment;
  const totalRevenue = totalLocalRevenue + stateRevenue + baseline.federalRevenue;
  const payroll = baseline.payroll * (1 + assumptions.workforceChange) * (1 + assumptions.compensationChange);
  const totalExpenditures = baseline.nonPayrollExpenditures + payroll;
  const surplusDeficit = totalRevenue - totalExpenditures;
  const revenuePerPupil = safeDivide(totalRevenue, enrollment);
  const expenditurePerPupil = safeDivide(totalExpenditures, enrollment);
  return {
    ...assumptions,
    currentYearTaxRevenue,
    propertyTaxRevenue: currentYearTaxRevenue,
    otherLocalRevenue: baseline.otherLocalRevenue,
    totalLocalRevenue,
    stateRevenue,
    federalRevenue: baseline.federalRevenue,
    stateFederalRevenue: stateRevenue + baseline.federalRevenue,
    totalRevenue,
    enrollment,
    payroll,
    payrollChange: payroll - baseline.payroll,
    totalExpenditures,
    expenditureImpact: totalExpenditures - baseline.totalExpenditures,
    payrollConcentration: safeDivide(payroll, totalExpenditures),
    surplusDeficit,
    deficitPercent: safeDivide(surplusDeficit, totalRevenue),
    revenuePerPupil,
    expenditurePerPupil,
    perPupilFundingGap: revenuePerPupil === null || expenditurePerPupil === null ? null : revenuePerPupil - expenditurePerPupil,
    coverageRatio: safeDivide(totalRevenue, totalExpenditures),
  };
}

export function calculateScenarios(baseline, scenarioInputs = [{ id: 'adopted', name: 'Adopted Budget', ...ADOPTED_ASSUMPTIONS }]) {
  // Attribution always uses the canonical adopted assumptions, even if users edit
  // the visible Adopted Base column. Reset actions can restore that column exactly.
  const adoptedReference = calculateScenario(baseline, {
    id: 'adopted-reference',
    name: 'Adopted Base Reference',
    ...ADOPTED_ASSUMPTIONS,
  });
  return scenarioInputs.map((scenario) => {
    const row = calculateScenario(baseline, scenario);
    const propertyTaxImpact = row.currentYearTaxRevenue - adoptedReference.currentYearTaxRevenue;
    const enrollmentStateImpact = row.stateRevenue - adoptedReference.stateRevenue;
    const payrollImpact = -(row.payroll - adoptedReference.payroll);
    const totalExplainedChange = propertyTaxImpact + enrollmentStateImpact + payrollImpact;
    const deficitChangeVsAdopted = row.surplusDeficit - adoptedReference.surplusDeficit;
    return {
      ...row,
      adoptedReference,
      taxRevenueVsAdopted: propertyTaxImpact,
      propertyTaxImpact,
      enrollmentStateImpact,
      payrollImpact,
      totalExplainedChange,
      attributionVariance: totalExplainedChange - deficitChangeVsAdopted,
      attributionReconciles: Math.abs(totalExplainedChange - deficitChangeVsAdopted) <= 1,
      deficitChangeVsAdopted,
      revenuePerPupilVsAdopted: row.revenuePerPupil - adoptedReference.revenuePerPupil,
    };
  });
}

export function requiredTaxGrowth(baseline, assumptions = ADOPTED_ASSUMPTIONS) {
  const scenario = calculateScenario(baseline, assumptions);
  const requiredTaxRevenue = scenario.totalExpenditures
    - baseline.otherLocalRevenue
    - scenario.stateRevenue
    - baseline.federalRevenue;
  return {
    requiredTaxRevenue,
    requiredGrowth: safeDivide(requiredTaxRevenue, baseline.impliedBaseTax) - 1,
  };
}

export function requiredWorkforceAdjustment(baseline, assumptions = ADOPTED_ASSUMPTIONS) {
  const scenario = calculateScenario(baseline, assumptions);
  const requiredPayroll = scenario.totalRevenue - baseline.nonPayrollExpenditures;
  const denominator = baseline.payroll * (1 + assumptions.compensationChange);
  return {
    requiredPayroll,
    requiredWorkforceChange: safeDivide(requiredPayroll, denominator) - 1,
  };
}

export function buildBreakEvenMatrix(baseline, options = {}) {
  const taxGrowths = options.taxGrowths ?? [-0.05, 0, 0.05, 0.10, 0.15, 0.20];
  const workforceChanges = options.workforceChanges ?? [-0.12, -0.08, -0.04, 0, 0.04, 0.08];
  const enrollmentChange = options.enrollmentChange ?? 0;
  const compensationChange = options.compensationChange ?? 0;
  return workforceChanges.map((workforceChange) => ({
    workforceChange,
    cells: taxGrowths.map((growth) => calculateScenario(baseline, {
      growth,
      workforceChange,
      compensationChange,
      enrollmentChange,
    })),
  }));
}

export function overviewMetrics(baseline) {
  const surplusDeficit = baseline.totalRevenue - baseline.totalExpenditures;
  return {
    totalRevenue: baseline.totalRevenue,
    totalExpenditures: baseline.totalExpenditures,
    surplusDeficit,
    propertyTaxConcentration: safeDivide(baseline.propertyTax, baseline.localRevenue),
    payrollConcentration: safeDivide(baseline.payroll, baseline.totalExpenditures),
    recaptureConcentration: safeDivide(baseline.recapture, baseline.totalExpenditures),
    revenuePerPupil: safeDivide(baseline.totalRevenue, baseline.enrollment),
    expenditurePerPupil: safeDivide(baseline.totalExpenditures, baseline.enrollment),
    coverageRatio: safeDivide(baseline.totalRevenue, baseline.totalExpenditures),
  };
}
