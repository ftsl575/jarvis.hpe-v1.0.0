# jarvis.hpe-v1.0.0

HPE NameFill automation parser

## Scripts

- `npm ci`
- `npm test`
- `npm run lint`
- `npm run dq:report`
- `npm run bench:parse`
- `npm run matrix:verify`
- `npm run matrix:stats`
- `npm run export:xlsx`
- `npm run export:xlsx:dry`

### XLSX exporter

- Place `input.txt` in the project root with one part number per line.
- `npm run export:xlsx:dry` creates `output.xlsx` in the project root, skips live fetches, and clears AI keys to avoid LLM calls during the dry run.
- `npm run export:xlsx` performs the same export with live PartSurfer/BuyHPE fetches enabled.

### Repo hygiene

- Generated workbooks such as `output.xlsx` are ignored and treated as binary assets via `.gitignore` and `.gitattributes`.
- CI runs lint, tests, matrix verification, and an exporter dry-run that uploads `output.xlsx` as a workflow artifact.

## Apps

### hpe-partsurfer

The `apps/hpe-partsurfer` directory contains a small utility that validates and normalizes HPE PartSurfer part numbers.

#### Install dependencies

```bash
cd apps/hpe-partsurfer
npm install
```

#### Run linting

```bash
npm run lint
```

#### Run tests with coverage

```bash
npm test
```

#### Generate the sample CSV output

```bash
npm run sample
```

The sample command reads from `sample_parts.txt` and produces `sample_results.csv` for quick smoke-testing.
