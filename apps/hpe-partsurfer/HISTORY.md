## [Unreleased]

- Added buy.hpe.com provider: fetch, parse, provider, CSV export, Windows-safe paths in tests.
- Enabled buy.hpe.com in main aggregator.
- Reordered batch CSV exports to prefix the key title columns, add a numeric index column, and
  normalise not-found states (auto-correction from `-002` to `-001`, `Product Not Found` URLs, and
  `CHECK MANUALLY` fallbacks).
- Patch: photo title description, robust autocorrect, 804329-002 manual check, PartSurfer 'Part Description',
  Buy not-found.

## v1.0.0-stable — October 2025

- Стабильная работа CLI и API для поиска на HPE PartSurfer.
- Поддерживаемые типы:
  - Option Kit Numbers (XXXXXX-B21)
  - SKU / Product Numbers (PXXXXX-B21, XXXXX-425)
- Обработка Spare и Assembly частично реализована (тестовый режим).
- Тесты 100% успешны (6/6 suites).
- Реализован экспорт в Excel (.xlsx) с колонками.
- Добавлен run_sample_parts.bat для Windows.
