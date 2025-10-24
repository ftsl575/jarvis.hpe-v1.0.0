# Development History — HPE PartSurfer Project

## 2025-10-23 → 2025-10-24
1. Репозиторий `ftsl575/jarvis.hpe-v1.0.0` инициализирован как копия `georgeglessner/HPEPartSurfer`.
2. Настроен GitHub Actions (CI + automerge).
3. Создана структура `apps/hpe-partsurfer/` с CLI-валидатором part numbers и Jest-тестами.
4. Исправлен CI (`working-directory: apps/hpe-partsurfer`).
5. CI прошёл успешно, PR мержен в main.
6. Локальная проверка:
   - `npm run lint` — без ошибок.
   - `npm test` — 8 passed, 100% coverage.
   - `npm run sample` — CSV успешно сгенерирован.
7. Подготовка к добавлению HTTP-API (Express /api/part).
8. Следующий шаг: реализовать HTTP-сервер и интеграцию с реальным парсером HPE PartSurfer.

## 2025-10-24 — HTTP API added
1. Добавлен HTTP-API сервер в `apps/hpe-partsurfer` на базе Express.
2. Эндпоинты:
   - `GET /health` → `{ ok: true }`
   - `GET /api/part?pn=XYZ` → `{ input, part_number, status }` (валидация PN).
3. Тесты: `npm test` — все тесты проходят (интеграционные тесты на supertest).
4. Локальная проверка:
   - `npm start` запускает сервер на `http://localhost:3000`
   - Примеры:
     - `/health` → `{"ok":true}`
     - `/api/part?pn=511778-001` → `{"input":"511778-001","part_number":"511778-001","status":"VALID"}`
5. Следующий шаг: добавить реальный парсинг страниц HPE PartSurfer (Search.aspx / ShowPhoto.aspx) и возврат полей `{ part_number, description, image_url, source_page, status }` в CLI и API.

## 2025-10-24 — Search + Photo parsing implemented
1. Реализован сбор метаданных с HPE PartSurfer:
   - Парсер Search.aspx (BOM/описание).
   - Парсер ShowPhoto.aspx (картинка/краткое описание).
   - Автоопределение режима и fallback: при отсутствии BOM на Search — попытка Photo.
2. Добавлен fetch-слой (axios) с таймаутом 10s и 2 ретраями, последовательное выполнение с троттлингом 1 req/с.
3. Обновлены CLI и HTTP-API: теперь возвращаются поля `{ part_number, description, image_url, source_page, status }`.
4. Тесты: nock-бэки для fetch и покрытие сценариев ok / no_bom / not_found; интеграционные тесты API.
5. Документация обновлена: режимы, схема вывода, примеры.
6. Следующий шаг: .env + логирование запросов (прокси, таймауты, ретраи) и Dockerfile.

## 2025-10-25 — Windows sample runner with Excel export
1. Добавлен сценарий `scripts/windows/run_sample_parts_excel.bat` для живой проверки CLI на Windows.
2. Скрипт создаёт CSV, перекодирует его в формат с точкой с запятой и экспортирует результат в Excel через `QueryTables`.
3. Добавлена документация по финальному тестовому прогону в `apps/hpe-partsurfer/docs/final_test_runner_windows.md`.

## Post-merge validation (fallback to Search when photo missing)
- tests: OK
- live: OK (QK733A, J9F43A)
- dumps: photo_* + search_* present
- csv: descriptions populated, image_url empty

## v1.0.0-stable — October 2025
- Стабильная работа CLI и API для поиска на HPE PartSurfer.
- Поддерживаемые типы:
  - Option Kit Numbers (XXXXXX-B21)
  - SKU / Product Numbers (PXXXXX-B21, XXXXX-425)
- Обработка Spare и Assembly частично реализована (тестовый режим).
- Тесты 100% успешны (6/6 suites).
- Реализован экспорт в Excel (.xlsx) с колонками.
- Добавлен run_sample_parts.bat для Windows.
## v1.1.0 – OKN/SKU Deep Parser
- Расширен парсер Search.aspx и Photo.aspx
- Добавлены normalization helpers
- Обновлены тесты и фикстуры
- Улучшен экспорт CSV/Excel
