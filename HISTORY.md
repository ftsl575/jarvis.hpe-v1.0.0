# Development History — HPE PartSurfer Project

## [Unreleased]
### Added
- Multi-source aggregator and 3-column CSV export (PartSurfer, Photo, BuyHpe).
- Fixed run_sample_buyhpe.bat path and added ESM sample runner.
- Added Input Data batch processor for list-based parsing with combined PartSurfer, PartSurfer Photo, and HPE Buy output.
- Normalized PS/Photo/Buy parsers (table/caption extraction, selector cascade, empty-DOM handling, SKU/URL normalization, retries/throttling, JSON logs, unified success criteria).
- Local XLSX exporter: `input.txt` → `output.xlsx` with dry-run mode.
- Matrix verification tooling (`matrix:verify`, `matrix:stats`).
- Repository safeguards to prevent committing generated `.xlsx` artifacts.

### Changed
- Documentation updated to reflect current scripts and workflows.

## 2025-10-25
- feat(csv): add classify_sources.ps1 to normalize source labels and use semicolon delimiter
- fix(source): improve source classification and batch conversion
- chore(git): add .gitignore to exclude generated CSV/XLSX and debug folders

## 2025-10-23 → 2025-10-24
1. Repository `ftsl575/jarvis.hpe-v1.0.0` initialized as a fork of `georgeglessner/HPEPartSurfer`.
2. GitHub Actions configured (CI).
3. Created `apps/hpe-partsurfer/` structure with CLI validator and Jest tests.
4. Fixed CI working directory.
5. CI passed; PR merged to main.
6. Local validation:
   - `npm run lint` — no errors.
   - `npm test` — 100% passing.
   - Sample CSV generated successfully.
7. Preparation for HTTP API (Express).
8. Next step: real HPE PartSurfer parser integration.

## 2025-10-24 — HTTP API added
1. Added Express-based HTTP API in `apps/hpe-partsurfer`.
2. Endpoints:
   - `GET /health` → `{ ok: true }`
   - `GET /api/part?pn=XYZ` → `{ input, part_number, status }`
3. Tests: all passing (supertest).
4. Local validation via `npm start`.
5. Next step: real page parsing and structured responses.

## 2025-10-24 — Search + Photo parsing implemented
- Implemented parsing of HPE PartSurfer Search.aspx and ShowPhoto.aspx.
- Added fetch layer with timeouts, retries, throttling.
- Updated CLI and API outputs.
- Added tests and fixtures.
- Documentation updated.

## 2025-10-25 — Windows sample runner with Excel export
- Added Windows batch script for live CLI testing and Excel export via QueryTables.
- Added documentation for Windows test runner.

## v1.0.0-stable — October 2025
- Stable CLI and API for HPE PartSurfer search.
- Supported Option Kit Numbers and SKUs.
- Partial Spare/Assembly support (test mode).
- All tests passing.
- Excel export supported.
- Windows sample runner added.

## v1.1.0 — OKN/SKU Deep Parser
- Extended Search.aspx and Photo.aspx parsing.
- Added normalization helpers.
- Updated tests and fixtures.
- Improved CSV/Excel export.
