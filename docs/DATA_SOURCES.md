# Data Sources and Provenance

## Primary financial source

[Dallas ISD FY2025–2026 Adopted Budget Book](https://resources.finalsite.net/images/v1748007423/dallasisdorg/ijtggpclsgyaiwo3l0dc/FY25-26AdoptedBudgetBook-May-Final.pdf)

| Page | Evidence used |
| --- | --- |
| 25 | Fund summary and General Operating Fund context. |
| 31 | General Fund revenue totals and components; FY2025 and FY2026 budget columns. The table retains a recommended-budget heading within the published adopted book. |
| 35 | General Fund expenditures, payroll and the $104M recapture footnote. |
| 83 | Enrollment summary and FY2026 projected enrollment of 139,890. |

FY2025 and FY2026 budget comparisons are not audited actual performance. ACFR-derived figures quoted within the budget book are secondary citations and do not establish a separate audited-statement extraction pipeline in this repository.

## Supporting documents

- [April 10, 2025 Board Briefing](https://resources.finalsite.net/images/v1744732788/dallasisdorg/lshjqwpvfuhltmn7ex73/25-26AprilBoardBriefing.pdf), p. 5: 5% taxable appraised-value growth planning assumption. Its preliminary enrollment and other amounts are not substituted for final adopted values.
- [Budget summary website posting](https://resources.finalsite.net/images/v1746719727/dallasisdorg/kcnnzyhnfkdtnehokxgy/2025-26BudgetSummaryWebsitePosting0507.pdf): supporting summary.
- [Community Budget Presentation](https://resources.finalsite.net/images/v1743090483/dallasisdorg/bbcwn8lx83wpsiat4bev/2025-2026CommunityBudgetPresentation.pdf): preliminary planning context. Its earlier revenue amount differs from the final adopted book by $4M and is not the dashboard baseline.

The 5% planning assumption calibrates the inferred tax base. It is not the 9.8% historical current-year tax-revenue increase between the budget columns, and the engine does not model tax rate and collection effects separately.

## Public workbook and data preparation

The distributed workbook is `src/assets/Dallas-ISD-Budget-Public.xlsx`. Personal file-location metadata was removed and creator attribution normalized. Financial values, formulas, cached values, charts, comments and seven-sheet structure were preserved in the prior verified sanitization.

Historical data preparation included manual work and Python-assisted PDF extraction. The original extraction script is unavailable in the project snapshot; reproducibility starts from the distributed workbook. `inspect_workbook.py` is a read-only OOXML inspection utility.

The application maps nine FY2026 inputs and recalculates its own ratios and scenarios. Spreadsheet formula execution is outside the application. Users preparing new workbooks should calculate and save them in Excel or another spreadsheet engine so cached formula values are available.

## Figures and screenshots

Dashboard screenshots in `docs/screenshots/` show the actual standalone application. Figures in `docs/charts/` were generated from the calculation engine for the accompanying report. Recovery and stress outputs are hypothetical scenario calculations. The $500M beginning reserve is illustrative.
