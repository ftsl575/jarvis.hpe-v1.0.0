# jarvis.hpe-v1.0.0

HPE NameFill automation parser

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
