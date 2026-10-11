# Financial and Technical Methodology

## Label-based mapping

Results are not tied to fixed cells such as `D6` or `E24`. Each metric defines its expected sheet, label aliases and FY26 header. Matching normalizes case, Unicode accents, punctuation, ampersands, line breaks and repeated whitespace. The nearest matching header above a label wins, which supports multiple tables with different FY26 column positions. Missing labels, headers or numeric values become visible validation errors.

## Guided Scenario Builder

Scenario Analysis was simplified so it can be understood and presented in under three minutes. Instead of showing five complete scenarios, twenty inputs, multiple charts and a wide table simultaneously, the screen guides the analyst through one transparent choice for each material fiscal driver:

- **Property-tax growth (blue):** Stress −2%, Flat 0%, Adopted Budget 5%, or Upside 8%.
- **Payroll (purple):** Compensation Pressure (0% workforce, +5% compensation), Adopted Base (0%, 0%), or Workforce Adjustment (−5% workforce, 0% compensation).
- **Enrollment (amber):** Enrollment Decline −5%, Stable Enrollment 0%, or Enrollment Growth +2%.

The 5% tax assumption is the official FY2026 budget assumption. All other menu alternatives are illustrative assumptions, not forecasts. The default selection—5% tax growth, adopted payroll and stable enrollment—reproduces the workbook exactly. Enrollment still does not automatically change property taxes or payroll, which keeps cost rigidity visible.

The main view shows only five outputs: revenue, expenditures, operating surplus/deficit, coverage and the per-pupil funding gap. Detailed revenue, expenditure, enrollment and reconciliation values remain available under **Show Calculation Details**, closed by default. A favorable change is labeled as an improvement, but a result that remains below zero continues to display as a deficit with warning treatment.

## Calculation formulas

### Property tax and revenue

```text
Implied base tax revenue = Adopted tax revenue / (1 + 5%)
Scenario property-tax revenue = Implied base × (1 + appraised-value growth)
Scenario local revenue = Scenario property tax + fixed other local revenue
Scenario enrollment = Base enrollment × (1 + enrollment change)
Scenario state revenue = Base state revenue per pupil × scenario enrollment
Scenario GF revenue = Local + scenario state + fixed federal revenue
```

State revenue uses a proportional per-pupil proxy; it does not recreate the Texas school funding formula.

### Payroll and expenditures

```text
Scenario payroll = Base payroll × (1 + workforce adjustment) × (1 + compensation growth)
Non-payroll expenditures = Base GF expenditures − base payroll
Scenario GF expenditures = Fixed non-payroll expenditures + scenario payroll
```

### Output metrics

```text
Budget surplus / deficit = GF revenue − GF expenditures
Coverage ratio = GF revenue / GF expenditures
Revenue per pupil = GF revenue / scenario enrollment
Expenditure per pupil = GF expenditures / scenario enrollment
Per-pupil funding gap = Revenue per pupil − expenditure per pupil
```

The calculated 1.0915x Debt Service Fund measure is **Debt Service Fund budgetary revenue-to-expenditure coverage**, not a traditional contractual DSCR.

A mechanical rise in revenue per pupil is not necessarily an improvement when enrollment declines.

## Operating-result bridge

**What Changed vs. Adopted Budget?** decomposes the Selected Scenario operating-result change:

```text
Property-tax impact = Scenario tax revenue − adopted tax revenue
Enrollment/state impact = Scenario state revenue − adopted state revenue
Payroll impact = −(Scenario payroll − adopted payroll)
Selected Scenario deficit = Adopted Budget deficit
  + property-tax impact + payroll impact + enrollment/state impact
```

The bridge must reconcile within a $1 rounding tolerance. A positive impact improves the operating result and a negative impact worsens it. The final line is the Selected Scenario deficit—not merely its change—and the compact “Bridge reconciled.” message keeps the audit check visible without competing with the result.

## Break-Even Analysis

The break-even tab solves two questions algebraically:

```text
Required tax revenue = Scenario expenditures − other local − scenario state − federal
Required tax growth = Required tax revenue / implied base tax revenue − 1

Required payroll = Scenario revenue − non-payroll expenditures
Required workforce adjustment =
  Required payroll / [base payroll × (1 + compensation growth)] − 1
```

At adopted assumptions, the 14.11% break-even property-tax result is total growth relative to the inferred pre-growth base, approximately 9.1 percentage points above the 5% adopted assumption. The −8.80% workforce result is a mathematical break-even result, not an operating recommendation.

The heatmap recalculates budget surplus/deficit across tax growth from −5% to +20% and workforce adjustment from −12% to +8%. Enrollment and compensation assumptions remain editable. Colors expose the approximate break-even boundary; they do not imply operating feasibility.

## Multi-Year Fiscal Outlook

Multi-Year Fiscal Outlook replaced the constant Fund Balance Runway so the analysis can answer when operating balance is reached and whether available fund balance remains until recovery. It starts from either the imported FY2026 Adopted Budget or the active Selected Scenario without modifying Scenario Analysis.

The starting scenario is a single calculated fiscal position. Future-year assumptions are annual changes applied to the immediately preceding year. Property-tax revenue, enrollment and payroll therefore compound across a 3-, 5- or 7-year horizon; other local revenue, federal revenue, state revenue per pupil and non-payroll expenditures remain fixed at starting-point amounts.

```text
Tax revenue(t) = Tax revenue(t−1) × [1 + tax growth(t)]
Enrollment(t) = Enrollment(t−1) × [1 + enrollment change(t)]
State revenue(t) = Starting state revenue per pupil × Enrollment(t)
Payroll(t) = Payroll(t−1) × [1 + workforce change(t)] × [1 + compensation growth(t)]
Operating result(t) = Total revenue(t) − Total expenditures(t)
```

**First Balanced Year** is the first year with a non-negative operating result. **Sustained Recovery Year** requires two consecutive non-negative years with coverage of at least 1.00x. A positive final year alone is not treated as confirmed sustained recovery.

Beginning Available Fund Balance refers to the beginning of the selected starting fiscal year. It is optional and has no official value hardcoded. The illustrative $500 million beginning fund balance is not an official Dallas ISD reserve value. The annual roll-forward reconciles the two mutually exclusive positions:

```text
Net financial position = Beginning available fund balance
  − Beginning funding shortfall + Annual surplus / deficit
Ending available fund balance = MAX(0, Net financial position)
Ending funding shortfall = MAX(0, −Net financial position)
```

An outstanding shortfall therefore must be repaid before a later surplus can rebuild available fund balance. Available fund balance and funding shortfall can never both be positive, and neither available fund balance nor its ratio displays below zero. The default 10% threshold is analytical and is not Dallas ISD policy; fund balance does not necessarily equal cash liquidity.

ARIMA, GARCH, Monte Carlo and VaR are not implemented. External model outputs may be translated into documented annual assumptions, but the dashboard does not run those models.

Annual paths may be classified by the user as illustrative, official, analyst-produced or external-model output. ARIMA may supply an expected annual path, Monte Carlo a selected percentile path and GARCH a downside assumption; VaR is not itself a budget forecast. The application does not run those models or independently validate user-entered paths.

## User workflow

1. Upload and validate the workbook.
2. Review Financial Overview.
3. Build one scenario using the three guided drivers in Scenario Analysis.
4. Review the operating result and reconciled bridge.
5. Start Multi-Year Fiscal Outlook from Adopted Budget or the Selected Scenario and enter a future annual path.
6. Use Break-Even Analysis if needed.

Scenario Library was removed to reduce duplication and keep the analytical workflow centered on one transparent, guided scenario builder.

## Validation

The application checks seven required sheets and nine core metrics. GF revenue reconciles to local + state + federal components. GF expenditures reconcile between `GF Expenditures` and the General Operating column of `Budget Summary`.

- **Ready:** required sheets and metrics exist; reconciliations pass.
- **Warning:** required data exists but a reconciliation differs.
- **Error:** required data is missing; analytical tabs remain disabled.

## Current limitations

- State revenue is estimated using a simplified proportional per-pupil proxy.
- The model does not reproduce weighted attendance, recapture rules or the complete Texas funding formula.
- Federal revenue, other local revenue and non-payroll costs remain fixed.
- Enrollment does not automatically reduce staffing.
- No tax-rate changes, financing, detailed liquidity, management actions or cash-flow timing effects are modeled.
- No backend, authentication, database, report export or workbook editing.
- Beginning available fund balance is not imported and remains optional and user-supplied.
- User-entered paths and source classifications are not independently validated.
- Recovery results depend entirely on the selected assumptions.
- Major workbook label/structure changes may require new aliases.
- Outputs are scenarios, not forecasts, ratings or investment recommendations.

