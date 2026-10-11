# Publication Preparation and Verification

## Candidate package

Prepared October 11, 2026. No repository, demo or release has been published by this preparation step.

This package contains the existing financial application, sanitized public Excel workbook, professional English README, methodology and provenance notes, selected current screenshots, the approved full report and approved three-page showcase. `dist/index.html` is supplied for local use and a future release asset; it remains ignored by git because it is a build output.

No financial calculations, application styling, test logic, dependencies or workbook financial values were changed. The repository's internal npm package name remains `dallas-isd-fiscal-stress-lab` to preserve the dependency manifest and lockfile.

## Checks rerun on this candidate

- `npm ci --ignore-scripts --no-audit --no-fund`: passed.
- `npm test`: 30 tests passed across two test files.
- `npm run build`: passed; 747.88 kB HTML, 274.75 kB gzip.
- Rebuilt HTML is byte-identical to the previously verified standalone file.
- All eight application JS/CSS files, both dependency manifests and public workbook match the supplied snapshot byte-for-byte.
- Public workbook XML contains no detected personal absolute paths or `absPath` metadata.
- Selected source and documentation scan found no credential patterns or personal absolute paths. This is a scoped screening, not a formal security certification.
- Relative README documentation, image and workbook links were checked before packaging.

The prior delivery record reports Chrome HTTP and `file://` workflows, no external application requests and a clean console. Those workflows were not rerun during this packaging step; the unchanged rebuilt HTML and source preserve the previously verified application. Browser reproduction instructions are in the README.

## Dependency audit

The production-only npm audit reports zero vulnerabilities for this dependency snapshot. The full audit reports three high-severity entries in the development chain `vite-plugin-singlefile` → `micromatch` → `braces`, representing the propagated stack-exhaustion advisory. No dependency upgrade or forced downgrade was applied in this documentation-only preparation. Recheck the audit when publishing; audit findings can change over time.

## Publication decisions still open

1. Confirm the public GitHub account and repository name. Suggested name: `dallas-isd-financial-risk-dashboard`.
2. Select a software license before describing the project as open source. No license has been silently assigned.
3. Decide whether to host a static demo. Local standalone access already works; a live demo is optional.
4. Approve the concrete repository/release contents before any public upload.
5. Add final public repository, demo and report-release links to the README and approved PDFs, then review the linked versions.

## Suggested first release

Title: `v1.0.0 — Financial Scenario Analysis and Multi-Year Outlook`

Description:

> Independent Dallas ISD budget research and an interactive local scenario-analysis application. This release includes the source model, scenario and break-even calculations, multi-year operating recovery and fund-balance reconciliation, documented assumptions, verification tests and the full methodology report. Outputs are hypothetical scenarios, not ratings or official forecasts.

Suggested assets: `index.html`, `Dallas-ISD-Financial-Research-Report-Final.pdf`, `Dallas-ISD-LinkedIn-Project-Showcase.pdf` and the sanitized public Excel workbook. Uploaded assets should correspond to the reviewed source revision.
