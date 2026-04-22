# 🤖 Telegram Task Bot для Cloudflare Workers

Полнофункциональный таск-менеджер бот с напоминаниями, календарём и управлением командой.

---

## ✨ Возможности

### Для руководителя:
- ✅ Создание организации с уникальным кодом
- ✅ Создание задач с дедлайнами (календарь + время)
- ✅ Назначение встреч с участниками
- ✅ Управление командой (одобрение/отклонение заявок)
- ✅ Просмотр задач команды с фильтрацией
- ✅ Календарь на неделю (задачи + встречи)
- ✅ Список просроченных задач
- ✅ Удаление задач и встреч
- ✅ Напоминания о приближающихся дедлайнах

### Для сотрудника:
- ✅ Присоединение к организации по коду
- ✅ Просмотр своих задач
- ✅ Изменение статуса задач (ожидает → в работе → завершена)
- ✅ Комментирование задач
- ✅ Просмотр встреч
- ✅ Напоминания за 24 часа до дедлайна

### Напоминания (автоматические):
- ⏰ За 24 часа - уведомление сотруднику
- ⏰ За 2 часа - уведомление боссу (если не завершена)
- ⏰ За 1 час - уведомление участникам встречи

---

## 🏗️ Архитектура

```
Telegram Bot (webhook)
      ↓
Cloudflare Workers (JavaScript)
      ↓
Cloudflare D1 Database (SQLite)
      ↓
Cron Triggers (каждые 15 минут)
```

---

## 📊 Сравнение с оригинальной версией

| Компонент | Python версия | Cloudflare версия |
|-----------|---------------|-------------------|
| **Язык** | Python 3.12 | JavaScript (ES6) |
| **Telegram библиотека** | python-telegram-bot | Нативный Fetch API |
| **База данных** | MySQL | Cloudflare D1 (SQLite) |
| **Получение updates** | Long Polling | Webhooks |
| **Напоминания** | APScheduler | Cron Triggers |
| **Состояния** | ConversationHandler | State Management (D1) |
| **Хостинг** | VPS (~$5-10/мес) | Cloudflare Workers (бесплатно) |
| **Масштабирование** | Ручное | Автоматическое |
| **Доступность** | ~99% | 99.99% (CDN) |

---

## 📁 Структура проекта

```
.
├── src/
│   └── index.js          # Основной код бота (2000+ строк)
├── schema.sql            # SQL схема базы данных
├── wrangler.toml         # Конфигурация Cloudflare Workers
├── package.json          # npm зависимости
├── DEPLOY.md            # Подробная инструкция деплоя
└── README.md            # Этот файл
```

---

## 🚀 Быстрый старт

```bash
# 1. Установи Wrangler
npm install -g wrangler
wrangler login

# 2. Создай D1 базу
wrangler d1 create taskbot_db
# Скопируй database_id в wrangler.toml

# 3. Инициализируй базу
wrangler d1 execute taskbot_db --file=schema.sql

# 4. Добавь токен бота
wrangler secret put BOT_TOKEN

# 5. Деплой
npm install
wrangler deploy

# 6. Настрой webhook
# Открой: https://твой-воркер.workers.dev/setup
```

Подробнее: см. **DEPLOY.md**

---

## 🗄️ База данных

### Таблицы:
- `organizations` - организации с платёжными кодами
- `users` - пользователи (boss/employee)
- `tasks` - задачи с дедлайнами и статусами
- `comments` - комментарии к задачам
- `meetings` - встречи
- `meeting_participants` - участники встреч
- `join_requests` - заявки на вступление
- `reminders_sent` - отправленные напоминания
- `user_states` - состояния пользователей (для ConversationHandler)

---

## 🔔 Cron Triggers

В `wrangler.toml`:
```toml
[triggers]
crons = ["*/15 * * * *"]  # Каждые 15 минут
```

Функция `scheduled()` проверяет:
- Задачи с приближающимися дедлайнами
- Встречи в ближайшие 2 часа
- Отправляет напоминания

---

## 💻 State Management

Замена Python ConversationHandler на собственную систему состояний:

```javascript
// Установить состояние
await setState(userId, 'CREATE_TASK_DESC', { description: '...' }, env);

// Получить состояние
const state = await getUserState(userId, env);
// → { user_id: 123, state: 'CREATE_TASK_DESC', data: '{"description":"..."}' }

// Очистить состояние
await clearState(userId, env);
```

---

## 📱 Основные команды бота

### Босс:
- `/start` - Начало работы / регистрация
- `➕ Создать задачу` - Создание новой задачи
- `📅 Назначить встречу` - Назначение встречи
- `📊 Задачи команды` - Просмотр всех задач
- `👥 Моя команда` - Управление сотрудниками
- `📆 Календарь` - Календарь на неделю
- `⚠️ Просроченные` - Просроченные задачи

### Сотрудник:
- `/start` - Начало работы / регистрация
- `📋 Мои задачи` - Список своих задач
- `📅 Мои встречи` - Предстоящие встречи

---

## 🔧 Настройка

### Переменные окружения:
- `BOT_TOKEN` - Telegram Bot Token (добавляется через `wrangler secret`)

### Конфигурация:
См. `wrangler.toml`

---

## 📈 Производительность

### Бесплатный план Cloudflare:
- ✅ 100,000 запросов/день
- ✅ Unlimited D1 queries (бета)
- ✅ 3 Cron расписания
- ✅ 10ms CPU time/запрос

Для бота с **50-100 активных пользователей** - абсолютно бесплатно!

---

## 🐛 Отладка

```bash
# Логи в реальном времени
wrangler tail

# Локальная разработка
wrangler dev

# Проверить webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Просмотр базы данных
wrangler d1 execute taskbot_db --command="SELECT * FROM users"
```

---

## 🤝 Вклад

Pull requests приветствуются!

---

## 📄 Лицензия

MIT

---

## 🙏 Благодарности

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)

---

**Вопросы?** Открой issue или читай подробную инструкцию в **DEPLOY.md**
