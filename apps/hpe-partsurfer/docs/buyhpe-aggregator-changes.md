# buy.hpe.com aggregator enablement checklist

- [x] Register the buy.hpe.com provider immediately after the PartSurfer provider in the main
  aggregation pipeline.
- [x] Normalise part numbers before executing the provider chain to avoid redundant lookups.
- [x] Emit buy.hpe.com items with the canonical source label `HPE Buy (buy.hpe.com)` for downstream
  classifiers.
- [x] Update developer notes describing the aggregator ordering and source precedence.
- [x] Record the change in `HISTORY.md`.

The checklist is informational and mirrors the manual QA steps performed during integration.
