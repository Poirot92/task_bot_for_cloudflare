# 🚀 ПОЛНЫЙ ДЕПЛОЙ Telegram бота на Cloudflare Workers

## ✅ Что входит в эту версию:

### Основной функционал:
- ✅ Регистрация (босс/сотрудник)
- ✅ Создание задач с календарём и выбором времени
- ✅ Назначение встреч
- ✅ Управление командой (приглашения, одобрение заявок)
- ✅ Просмотр задач, комментарии, изменение статусов
- ✅ Календарь на неделю
- ✅ Просроченные задачи
- ✅ **Напоминания через Cron Triggers** (каждые 15 минут)
- ✅ **State Management** (замена ConversationHandler)
- ✅ Cloudflare D1 база данных (SQLite)

---

## 📋 Требования:

1. Node.js (v16 или выше)
2. Аккаунт Cloudflare (бесплатный)
3. Telegram Bot Token

---

## 🔧 Шаг 1: Установка Wrangler CLI

```bash
# Установи Wrangler глобально
npm install -g wrangler

# Залогинься в Cloudflare
wrangler login
```

Откроется браузер - подтверди доступ.

---

## 📊 Шаг 2: Создание D1 базы данных

```bash
# Создай базу данных
wrangler d1 create taskbot_db
```

**ВАЖНО:** Скопируй `database_id` из вывода:

```
✅ Successfully created DB 'taskbot_db'

[[d1_databases]]
binding = "DB"
database_name = "taskbot_db"
database_id = "abcd1234-5678-90ab-cdef-1234567890ab"  # ← СКОПИРУЙ ЭТО
```

Открой `wrangler.toml` и замени:
```toml
database_id = "ваш_database_id_после_создания"
```

На:
```toml
database_id = "abcd1234-5678-90ab-cdef-1234567890ab"  # твой ID
```

---

## 🗄️ Шаг 3: Инициализация базы данных

```bash
# Примени SQL схему
wrangler d1 execute taskbot_db --file=schema.sql
```

Должно вывести: `🌀 Executed 11 commands in X.XXms`

---

## 🔑 Шаг 4: Добавление Bot Token

```bash
# Добавь BOT_TOKEN как секрет
wrangler secret put BOT_TOKEN
```

Введи токен бота когда попросит (получи в [@BotFather](https://t.me/BotFather)).

---

## 🚀 Шаг 5: Деплой

```bash
# Установи зависимости
npm install

# Деплой на Cloudflare
wrangler deploy
```

Получишь URL типа: `https://taskbot.твой-subdomain.workers.dev`

---

## 🔗 Шаг 6: Настройка Webhook

Открой в браузере:
```
https://taskbot.твой-subdomain.workers.dev/setup
```

Должно вернуть:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

---

## ✅ ГОТОВО!

Бот запущен и работает 24/7! Напиши боту `/start` в Telegram.

---

## 🔔 Как работают Cron Triggers (напоминания):

### В wrangler.toml:
```toml
[triggers]
crons = ["*/15 * * * *"]  # Каждые 15 минут
```

Cloudflare автоматически вызывает функцию `scheduled()` каждые 15 минут.

### Напоминания:
- **За 24 часа** - уведомление сотруднику о приближающемся дедлайне
- **За 2 часа** - уведомление боссу если задача не завершена
- **За 1 час** - уведомление участникам о встрече

---

## 📝 State Management (замена ConversationHandler)

### Как это работает:

**Python версия (было):**
```python
CREATE_ORG, CREATE_TASK_DESC = range(2)

conv_handler = ConversationHandler(
    entry_points=[...],
    states={
        CREATE_ORG: [...],
        CREATE_TASK_DESC: [...]
    }
)
```

**Cloudflare Workers (стало):**

Используем таблицу `user_states` в D1:

```javascript
// Сохранить состояние
await setState(userId, 'CREATE_ORG', null, env);

// Получить состояние
const state = await getUserState(userId, env);
// { user_id: 123, state: 'CREATE_ORG', data: '{}' }

// Очистить состояние
await clearState(userId, env);
```

### Пример flow создания задачи:

1. Пользователь нажимает "➕ Создать задачу"
   → Устанавливается состояние `CREATE_TASK_DESC`

2. Пользователь вводит описание "Сделать отчёт"
   → Состояние меняется на `CREATE_TASK_DEADLINE`
   → Данные: `{ description: "Сделать отчёт" }`

3. Пользователь выбирает дату в календаре
   → Данные: `{ description: "...", year: 2024, month: 12, day: 25 }`

4. Пользователь выбирает время "14:00"
   → Данные обновляются: `{ ..., deadline: "2024-12-25 14:00" }`
   → Состояние: `SELECT_EMPLOYEE`

5. Пользователь выбирает сотрудников
   → Задача создаётся
   → Состояние очищается

---

## 🛠️ Полезные команды

### Логи в реальном времени:
```bash
wrangler tail
```

### Локальная разработка:
```bash
wrangler dev
```

### Работа с базой данных:
```bash
# Посмотреть всех пользователей
wrangler d1 execute taskbot_db --command="SELECT * FROM users"

# Посмотреть все задачи
wrangler d1 execute taskbot_db --command="SELECT * FROM tasks"

# Очистить таблицу
wrangler d1 execute taskbot_db --command="DELETE FROM tasks"
```

### Обновить бота:
```bash
wrangler deploy
```

---

## 💰 Лимиты бесплатного плана Cloudflare Workers:

- ✅ **100,000 запросов в день** (более чем достаточно)
- ✅ **Unlimited D1 запросы** (пока в бета)
- ✅ **Cron triggers** - 3 расписания бесплатно
- ✅ **10ms CPU time** на запрос
- ✅ **128MB памяти**

Для таск-бота с 50-100 пользователями это **абсолютно бесплатно**!

---

## 🔍 Отладка

### Проверить webhook:
```bash
curl https://api.telegram.org/bot<ВАШ_ТОКЕН>/getWebhookInfo
```

### Удалить webhook (если нужно):
```bash
curl https://api.telegram.org/bot<ВАШ_ТОКЕН>/deleteWebhook
```

### Проверить логи Cron:
```bash
wrangler tail --format=pretty
```

Подожди 15 минут и увидишь вызовы `scheduled()`.

---

## 🆘 Частые проблемы

### 1. "Database not found"
- Проверь что `database_id` в `wrangler.toml` правильный
- Запусти `wrangler d1 list` чтобы посмотреть все базы

### 2. Бот не отвечает
- Проверь webhook: `/setup` должен вернуть `"ok": true`
- Проверь логи: `wrangler tail`
- Проверь что BOT_TOKEN добавлен: `wrangler secret list`

### 3. Напоминания не работают
- Проверь что в `wrangler.toml` есть:
  ```toml
  [triggers]
  crons = ["*/15 * * * *"]
  ```
- Проверь логи: `wrangler tail`

### 4. "table user_states does not exist"
- Таблица создаётся автоматически при первом использовании
- Если ошибка повторяется, запусти:
  ```bash
  wrangler d1 execute taskbot_db --command="CREATE TABLE IF NOT EXISTS user_states (user_id INTEGER PRIMARY KEY, state TEXT NOT NULL, data TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
  ```

---

## 📚 Дополнительная информация

### Cloudflare Workers документация:
- https://developers.cloudflare.com/workers/

### D1 база данных:
- https://developers.cloudflare.com/d1/

### Cron Triggers:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/

---

## 🎯 Что дальше?

1. ✅ **Добавить аналитику** - сколько задач создано, кто активнее
2. ✅ **Экспорт отчётов** - выгрузка задач в Excel/PDF
3. ✅ **Интеграция с Google Calendar** - синхронизация встреч
4. ✅ **Уведомления на email** - дублирование напоминаний

---

## 💡 Преимущества Cloudflare Workers vs обычный VPS:

| Характеристика | VPS | Cloudflare Workers |
|----------------|-----|-------------------|
| Стоимость | ~$5-10/мес | **Бесплатно** до 100k req/день |
| Доступность | 99% (зависит от хостера) | **99.99%** (CDN по всему миру) |
| Масштабирование | Ручное | **Автоматическое** |
| Настройка | Нужно настраивать сервер | **Из коробки** |
| Обновления | Вручную | `wrangler deploy` |
| Миграция | Сложно | **Портативно** (просто код) |

---

Удачи с деплоем! 🚀
