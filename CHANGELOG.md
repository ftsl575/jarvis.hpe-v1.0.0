# Changelog

## v2.1.0
### Added
- Unified AI adapter (ChatGPT + DeepSeek) с интерфейсом IAIProvider.
- Новый эндпоинт /v3/ai/unified.
- Database schema v3 и seed для HPE PartSurfer.
- Скрипт авто-синхронизации scripts/hpe-db-refresh.ts.
- Workflow API Unified Health.
### Changed
- Упрощён CI для release/*.
- Помечен как deprecated /v2/ai/query.
### Fixed
- Улучшен network fallback в интеграции с провайдерами.
