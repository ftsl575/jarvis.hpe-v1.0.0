# HPE PartSurfer Utilities

Utilities for parsing and validating HPE PartSurfer part numbers.

## API

Start the HTTP API locally:

```bash
npm start
```

Available endpoints:

- `GET /health` – returns `{ ok: true }` when the service is running.
- `GET /api/part?pn=511778-001` – validates the provided part number and responds with the normalized part number and validation status.
