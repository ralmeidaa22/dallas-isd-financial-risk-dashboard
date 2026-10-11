# Workbook Analysis

Inspected source: `Dallas ISD Budget data .xlsx` (original left unchanged).

## Sheets

1. Budget Summary
2. GF Revenue
3. GF Expenditures
4. Other Funds
5. Enrollment
6. Scenario Analysis
7. Financial Ratios

## FY26 source metrics

| Metric | Sheet label | Header | Value |
|---|---|---|---:|
| Current-year property tax | Taxes - Current Year | FY26 Adopted | $1,484,904,976 |
| Local/intermediate revenue | Total Local/Intermediate Revenue | FY26 Adopted | $1,540,524,976 |
| State revenue | Total State Program Revenue | FY26 Adopted | $166,516,511 |
| Federal revenue | Total Federal Program Revenue | FY26 Adopted | $47,649,092 |
| Total GF revenue | TOTAL GENERAL FUND REVENUE | FY26 Adopted | $1,754,690,579 |
| Total GF expenditures | TOTAL GENERAL FUND EXPENDITURES | FY26 Adopted | $1,883,564,247 |
| Projected enrollment | TOTAL ALL CAMPUSES | FY26 Projected Enrollment | 139,890 |
| Payroll | Payroll Costs | FY26 Adopted | $1,464,112,663 |
| Recapture | WADA Purchase (Recapture) | FY26 Adopted | $104,000,000 |

## Scenario Analysis formula model

The sheet assumes 5% adopted appraised-value growth. Its implied pre-growth tax base is $1,414,195,215.238095. Other local revenue is $55,620,000; state plus federal revenue is $214,165,603. Total GF expenditures and enrollment remain fixed.

| Scenario | Growth | Total GF revenue | Surplus / (deficit) | Coverage |
|---|---:|---:|---:|---:|
| Stress | -2% | $1,655,696,913.93 | ($227,867,333.07) | 0.879023x |
| Bear | 0% | $1,683,980,818.24 | ($199,583,428.76) | 0.894039x |
| Moderate | 2% | $1,712,264,722.54 | ($171,299,524.46) | 0.909056x |
| Adopted (Base) | 5% | $1,754,690,579.00 | ($128,873,668.00) | 0.931580x |
| Bull | 8% | $1,797,116,435.46 | ($86,447,811.54) | 0.954104x |

All source formulas and cached values were inspected from the workbook's OOXML. Automated tests independently calculate these outputs from label-mapped input values.
