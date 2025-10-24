# HPE PartSurfer Utilities

Utilities for fetching and parsing metadata from [HPE PartSurfer](https://partsurfer.hpe.com/) pages.

## Modes and sources

The parser supports the two PartSurfer page types that expose part metadata:

- **Search.aspx** – Service parts such as `511778-001` or `797458-B21`. These pages include the bill of materials (BOM) when available.
- **ShowPhoto.aspx** – Accessory and option kits such as `AF573A` or `R2J63A`. These pages expose imagery and short descriptions.

Part numbers ending in `-001` or `-002` automatically try the Search page first and fall back to the Photo page when the BOM is missing. Accessory style codes that match `^[A-Z0-9]{3,6}A$` use the Photo page directly. Service kits ending with `-B21` or `-B22` remain Search-only.

## Output schema

Both the CLI and HTTP API return the same structure for each processed part number:

| Field | Description |
| ----- | ----------- |
| `part_number` | Normalized part number (upper case, trimmed). |
| `description` | Part description when found, otherwise `null`. |
| `image_url` | Relative or absolute URL of the part image when available. |
| `source_page` | Either `Search` or `Photo`, describing which page produced the result. |
| `status` | `ok`, `no_bom`, or `not_found` depending on page content. |

- `ok` – description found and, when applicable, a BOM is present.
- `no_bom` – Search page returned data but the BOM is missing; the parser may still enrich the record with Photo data.
- `not_found` – neither Search nor Photo pages exposed a description for the part number.

## Command line interface

The CLI reads part numbers from a text file, deduplicates them, and writes the parsed data to CSV.

```bash
npm install
node src/cli.js --input sample_parts.txt --out results.csv
```

Sample CSV header:

```
part_number,description,image_url,source_page,status
```

Example row:

```
511778-001,Cooling Fan Assembly,/images/fan.jpg,Search,ok
```

CLI requests are throttled to one page per second to avoid stressing the public PartSurfer service.

## HTTP API

Start the API locally:

```bash
npm start
```

Endpoints:

- `GET /health` – returns `{ "ok": true }` when the service is running.
- `GET /api/part?pn=511778-001` – responds with the JSON row described above.

Example response:

```json
{
  "part_number": "511778-001",
  "description": "Cooling Fan Assembly",
  "image_url": "/images/fan.jpg",
  "source_page": "Search",
  "status": "ok"
}
```

Errors from the upstream PartSurfer site are surfaced with HTTP status `502` and a short message.

## Testing

Run the Jest suite (network calls are fully mocked via `nock`):

```bash
npm test
```
