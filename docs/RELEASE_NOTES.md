# Publication and Verification

## v1.0.1 documentation update

Release: https://github.com/ralmeidaa22/dallas-isd-financial-risk-dashboard/releases/tag/v1.0.1

Replaced the two reports with author-supplied PDFs from `Dallas-ISD-PDFs-With-Public-Links`. The 31-page research report and three-page showcase contain clickable repository, demo and original v1.0.0 release links; all three destinations returned HTTP 200 before replacement. No PDF binaries were edited by the publication workflow.

The application, dependencies, workbook and standalone HTML are unchanged. The v1.0.0 tag, release and assets remain intact. This update includes both updated PDFs, the same standalone HTML and the same public workbook. Functional browser results below belong to v1.0.0 and are not represented as newly rerun checks for this documentation update.

## v1.0.0 publication

Published repository: https://github.com/ralmeidaa22/dallas-isd-financial-risk-dashboard

Verified demo: https://ralmeidaa22.github.io/dallas-isd-financial-risk-dashboard/

Downloadable release: https://github.com/ralmeidaa22/dallas-isd-financial-risk-dashboard/releases/tag/v1.0.0

Publication verification on October 11, 2026:

- Local `npm ci`, `npm test` (30 tests across two files) and `npm run build` passed with Node.js 24.
- GitHub Actions build and Pages deployment passed. The workflow runs on pushes to `main` and manual dispatch, uses Node.js 24, tests before building, and uploads only `dist` with the official Pages actions. `dist` remains ignored by Git.
- The deployed URL returned HTTP 200 in headless Chrome. Sample loading, guided scenarios, operating-result bridge, multi-year horizons and recovery paths, fund-balance floor and shortfall repayment, Break-Even's 36-cell matrix, all navigation tabs and public workbook upload passed.
- No browser console or uncaught application errors were observed. The initial network request downloaded the bundled HTML; no HTTP(S) application requests occurred during sample loading, scenario operations or workbook upload. Source inspection confirms uploaded files are read with `File.arrayBuffer()` and parsed in browser memory. These checks cover the exercised workflows, not every possible user input.
- The $500M beginning reserve example is illustrative, not an official Dallas ISD balance. Outputs are hypothetical scenarios, not official forecasts, ratings or investment recommendations.
- Financial logic, dependencies, public workbook and approved PDF binaries remain unchanged. Pending links within the PDFs have not been corrected and will be reviewed separately.

## Remaining decisions

- No software license has been selected; repository visibility does not imply an open-source license.
- The pending PDF links recorded for v1.0.0 were resolved in the author-supplied v1.0.1 reports.
- Dependency audit results below belong to the earlier candidate preparation and were not rerun for this publication; no dependency changes were made.

## Historical candidate preparation

Prepared October 11, 2026. No repository, demo or release has been published by this preparation step.

This package contains the existing financial application, sanitized public Excel workbook, professional English README, methodology and provenance notes, selected current screenshots, the approved full report and approved three-page showcase. `dist/index.html` is supplied for local use and a future release asset; it remains ignored by git because it is a build output.

No financial calculations, application styling, test logic, dependencies or workbook financial values were changed. The repository's internal npm package name remains `dallas-isd-fiscal-stress-lab` to preserve the dependency manifest and lockfile.

## Historical candidate checks

- `npm ci --ignore-scripts --no-audit --no-fund`: passed.
- `npm test`: 30 tests passed across two test files.
- `npm run build`: passed; 747.88 kB HTML, 274.75 kB gzip.
- Rebuilt HTML is byte-identical to the previously verified standalone file.
- All eight application JS/CSS files, both dependency manifests and public workbook match the supplied snapshot byte-for-byte.
- Public workbook XML contains no detected personal absolute paths or `absPath` metadata.
- Selected source and documentation scan found no credential patterns or personal absolute paths. This is a scoped screening, not a formal security certification.
- Relative README documentation, image and workbook links were checked before packaging.

The prior delivery record reports Chrome HTTP and `file://` workflows, no external application requests and a clean console. Those workflows were not rerun during this packaging step; the unchanged rebuilt HTML and source preserve the previously verified application. Browser reproduction instructions are in the README.

## Historical dependency audit

The production-only npm audit reports zero vulnerabilities for this dependency snapshot. The full audit reports three high-severity entries in the development chain `vite-plugin-singlefile` → `micromatch` → `braces`, representing the propagated stack-exhaustion advisory. No dependency upgrade or forced downgrade was applied in this documentation-only preparation. Recheck the audit when publishing; audit findings can change over time.

## Original candidate release proposal

Title: `v1.0.0 — Financial Scenario Analysis and Multi-Year Outlook`

Description:

> Independent Dallas ISD budget research and an interactive local scenario-analysis application. This release includes the source model, scenario and break-even calculations, multi-year operating recovery and fund-balance reconciliation, documented assumptions, verification tests and the full methodology report. Outputs are hypothetical scenarios, not ratings or official forecasts.

Suggested assets: `index.html`, `Dallas-ISD-Financial-Research-Report-Final.pdf`, `Dallas-ISD-LinkedIn-Project-Showcase.pdf` and the sanitized public Excel workbook. Uploaded assets should correspond to the reviewed source revision.
