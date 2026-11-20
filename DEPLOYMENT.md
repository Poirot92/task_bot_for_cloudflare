# Деплой task-bot

## Источник истины

Репозиторий GitHub `Poirot92/task_bot_for_cloudflare`, ветка `main`, является источником истины для кода Worker. Не редактируйте код Worker вручную в Cloudflare Dashboard: такие изменения не попадут обратно в GitHub.

## Автоматический деплой

Cloudflare Workers Builds подключён к этому репозиторию. Коммит в `main` запускает сборку и деплой Production командой `npx wrangler deploy`. Изменения в других ветках могут собираться как Preview.

Для изменений кода создавайте ветку и Pull Request, проверяйте diff и результаты сборки, затем сливайте в `main`.

## Конфигурация и секреты

Cloudflare bindings, D1 и secrets хранятся в Cloudflare. Не добавляйте токены и секреты в GitHub. Изменения схемы D1, данных, webhook или production bindings требуют отдельной проверки и согласования.