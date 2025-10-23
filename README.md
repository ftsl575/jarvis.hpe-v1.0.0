# jarvis.hpe-v1.0.0

Automation utilities for working with HPE services.

## HPE PartSurfer Parser

The `apps/hpe-partsurfer` project contains a Node.js 20 application that parses
HPE PartSurfer search and photo pages. It provides both a CLI and an Express API
for retrieving descriptions, product images, and BOM availability for part
numbers.

### Getting started

```bash
cd apps/hpe-partsurfer
npm ci
```

### CLI usage

1. Create a text file with one part number per line (duplicates are removed).
2. Run the CLI and provide the input file and the desired CSV output path:

```bash
node src/cli.js --input parts.txt --out results.csv
```

The CLI respects a one request per second throttle. During testing you can
override it with `HPE_PARTSURFER_THROTTLE_MS=0`.

### Express API

```bash
npm start
# GET http://localhost:3000/parts/511778-001
```

### Testing and linting

```bash
npm run lint
npm test
```

### Sample output

Run the sample generator to create `apps/hpe-partsurfer/artifacts/sample-results.csv`:

```bash
npm run sample
```

### License

The HPE PartSurfer parser is based on the original
[HPEPartSurfer](https://github.com/georgeglessner/HPEPartSurfer) project and is
published under the MIT License.
