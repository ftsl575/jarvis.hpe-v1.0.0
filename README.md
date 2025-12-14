# jarvis.hpe-v1.0.0

HPE NameFill / PartSurfer automation parser and tooling.

## Requirements
- Node.js (LTS or newer)
- Windows / PowerShell supported

## Installation
```bash
npm ci
```

## Available Scripts

### Core
```bash
npm test
npm run lint
```

### Data quality and benchmarks
```bash
npm run dq:report
npm run bench:parse
```

### Matrix verification
```bash
npm run matrix:verify
npm run matrix:stats
```

### XLSX Export
```bash
npm run export:xlsx
npm run export:xlsx:dry
```

**Usage:**
1. Place `input.txt` in the project root (one part number per line).
2. Run:
   ```bash
   npm run export:xlsx:dry
   ```
3. The command generates `output.xlsx` in the project root.

Dry-run mode does not call LLM providers and is intended for local and CI-safe verification.

## Repository hygiene
- Generated files such as `output.xlsx` must not be committed.
- The repository includes rules to avoid committing binary artifacts.

## Notes
- The project focuses on transparent, verifiable parsing of HPE part data.
- Documentation reflects only features present in the repository.
