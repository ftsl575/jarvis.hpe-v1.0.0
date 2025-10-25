## [Unreleased]

- Added buy.hpe.com provider: fetch, parse, provider, CSV export, Windows-safe paths in tests.
- Enabled buy.hpe.com in main aggregator.

## v1.0.0-stable — October 2025

- Стабильная работа CLI и API для поиска на HPE PartSurfer.
- Поддерживаемые типы:
  - Option Kit Numbers (XXXXXX-B21)
  - SKU / Product Numbers (PXXXXX-B21, XXXXX-425)
- Обработка Spare и Assembly частично реализована (тестовый режим).
- Тесты 100% успешны (6/6 suites).
- Реализован экспорт в Excel (.xlsx) с колонками.
- Добавлен run_sample_parts.bat для Windows.
