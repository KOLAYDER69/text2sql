# text2SQL — Инструкция по развёртыванию

## Что это

text2SQL — AI-ассистент, который превращает вопросы на естественном языке в SQL-запросы, выполняет их и анализирует результат. Работает в вебе и в Telegram.

## Архитектура

```
querybot/
├── packages/query-engine/   # AI-пайплайн (Haiku → Sonnet → Opus)
├── apps/web/                # Next.js 16 — веб-интерфейс
├── apps/api/                # Express 5 — REST API
├── apps/bot/                # Grammy.js — Telegram-бот
└── scripts/                 # SQL-миграции
```

## Поддерживаемые базы данных

- **PostgreSQL** 15+ (полная поддержка: enum, CHECK constraints, отношения)
- **MySQL** 8+ (enum, отношения, information_schema)
- **SQLite** 3+ (базовая интроспекция, PRAGMA)

Тип БД определяется автоматически по формату DATABASE_URL:
- `postgresql://...` → PostgreSQL
- `mysql://...` или `mysql2://...` → MySQL
- `path/to/file.db` или `sqlite://path` → SQLite

## Требования

- Node.js 22+
- npm 10+
- PostgreSQL 15+ / MySQL 8+ / SQLite 3+ (для бизнес-данных)
- PostgreSQL (для app-базы — хранение пользователей, истории)
- Anthropic API ключ (Claude)
- Telegram Bot Token (через @BotFather)

---

## Шаг 1: Клонировать и установить зависимости

```bash
git clone <url-репозитория> text2sql
cd text2sql
npm install
```

npm install установит зависимости для всех пакетов (monorepo с workspaces).

---

## Шаг 2: Создать две базы данных PostgreSQL

### База данных с бизнес-данными (DATABASE_URL)

Это база, к которой будут задаваться вопросы. Она может быть вашей существующей базой данных. Подключение будет **только на чтение** (SELECT).

Если хотите попробовать на демо-данных:

```bash
psql <ваш_DATABASE_URL> < scripts/seed.sql
```

Это создаст демо-таблицы: customers, categories, products, orders, order_items (на русском языке).

### База данных приложения (APP_DATABASE_URL)

Отдельная база для хранения пользователей, истории запросов, расписаний и т.д.

Создайте пустую базу и выполните миграции по порядку:

```bash
psql <ваш_APP_DATABASE_URL> < scripts/migrate-001-app-tables.sql
psql <ваш_APP_DATABASE_URL> < scripts/migrate-002-schema-descriptions.sql
psql <ваш_APP_DATABASE_URL> < scripts/migrate-003-user-permissions.sql
psql <ваш_APP_DATABASE_URL> < scripts/migrate-004-dashboard.sql
```

**Важно:** В файле `migrate-001-app-tables.sql` есть seed-запрос с admin-пользователем. Замените `telegram_id` на свой Telegram ID, чтобы получить роль admin.

---

## Шаг 3: Создать Telegram-бота

1. Откройте @BotFather в Telegram
2. Отправьте `/newbot`
3. Придумайте имя и username бота
4. Сохраните токен бота

---

## Шаг 4: Получить Anthropic API ключ

1. Зарегистрируйтесь на https://console.anthropic.com
2. Создайте API ключ
3. Пополните баланс (используются модели Haiku, Sonnet, Opus)

---

## Шаг 5: Настроить переменные окружения

### apps/web/.env.local

```env
ANTHROPIC_API_KEY=sk-ant-api03-ваш-ключ
DATABASE_URL=postgresql://user:pass@host:5432/business_db
APP_DATABASE_URL=postgresql://user:pass@host:5432/app_db
JWT_SECRET=любая-длинная-случайная-строка-минимум-32-символа
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
NEXT_PUBLIC_TELEGRAM_BOT_NAME=username_вашего_бота
```

### apps/api/.env

```env
ANTHROPIC_API_KEY=sk-ant-api03-ваш-ключ
DATABASE_URL=postgresql://user:pass@host:5432/business_db
APP_DATABASE_URL=postgresql://user:pass@host:5432/app_db
JWT_SECRET=та-же-строка-что-в-web
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
NEXT_PUBLIC_TELEGRAM_BOT_NAME=username_вашего_бота
NEXT_PUBLIC_WEB_URL=http://localhost:3000
PORT=3001
```

### apps/bot/.env

```env
ANTHROPIC_API_KEY=sk-ant-api03-ваш-ключ
DATABASE_URL=postgresql://user:pass@host:5432/business_db
APP_DATABASE_URL=postgresql://user:pass@host:5432/app_db
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
NEXT_PUBLIC_TELEGRAM_BOT_NAME=username_вашего_бота
NEXT_PUBLIC_WEB_URL=http://localhost:3000
```

---

## Шаг 6: Настроить API rewrite

Откройте `apps/web/next.config.ts` и замените URL на свой API:

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ["@querybot/engine"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*", // ваш API сервер
      },
    ];
  },
};
```

Для локальной разработки укажите `http://localhost:3001`. Для продакшна — адрес вашего сервера.

---

## Шаг 7: Запустить локально

Откройте три терминала:

### Терминал 1 — API сервер

```bash
cd apps/api
npm run dev
```

Запустится на порту 3001 (или PORT из .env).

### Терминал 2 — Веб-интерфейс

```bash
cd apps/web
npm run dev
```

Откроется на http://localhost:3000

### Терминал 3 — Telegram-бот

```bash
cd apps/bot
npm run dev
```

Бот начнёт слушать сообщения через long polling.

---

## Шаг 8: Первый вход

1. Откройте http://localhost:3000
2. Нажмите "Войти через Telegram"
3. Бот отправит сообщение — нажмите /start
4. Вы авторизованы

Или напишите боту в Telegram напрямую — он тоже принимает вопросы.

---

## Продакшн-деплой

### Веб (Vercel)

```bash
cd apps/web
npx vercel --prod
```

Добавьте все переменные из `.env.local` в настройки проекта на Vercel.

### API + Бот (VPS / сервер)

1. Скопируйте проект на сервер
2. Установите зависимости: `npm install`
3. Создайте systemd-сервисы:

**querybot-api.service:**
```ini
[Unit]
Description=text2SQL API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/text2sql/apps/api
ExecStart=/usr/bin/npx tsx src/index.ts
EnvironmentFile=/opt/text2sql/apps/api/.env
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**querybot-bot.service:**
```ini
[Unit]
Description=text2SQL Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/text2sql/apps/bot
ExecStart=/usr/bin/npx tsx src/index.ts
EnvironmentFile=/opt/text2sql/apps/bot/.env
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo cp querybot-api.service /etc/systemd/system/
sudo cp querybot-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now querybot-api querybot-bot
```

Не забудьте обновить `next.config.ts` — заменить URL в rewrites на адрес вашего сервера.

---

## Как подключить свою базу данных

text2SQL автоматически читает схему любой базы данных. Просто укажите DATABASE_URL — система сама:

- Определит тип БД (PostgreSQL, MySQL, SQLite) по формату URL
- Прочитает все таблицы и колонки
- Распарсит enum-значения (PostgreSQL: pg_enum + CHECK, MySQL: COLUMN_TYPE)
- Определит связи между таблицами по naming convention (user_id → users.id)
- Сгенерирует SQL на правильном диалекте (PostgreSQL/MySQL/SQLite синтаксис)

Примеры DATABASE_URL:
```
# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/mydb

# MySQL
DATABASE_URL=mysql://user:pass@host:3306/mydb

# SQLite
DATABASE_URL=sqlite:///path/to/database.db
DATABASE_URL=/path/to/database.sqlite
```

Для лучших результатов можно добавить описания таблиц и колонок через интерфейс "Training" в веб-приложении.

---

## Стоимость API

Примерная стоимость одного запроса:

| Шаг | Модель | Стоимость |
|-----|--------|-----------|
| Перевод вопроса | Haiku | ~$0.001 |
| Генерация SQL | Sonnet | ~$0.01 |
| Анализ результата | Opus | ~$0.05 |
| **Итого** | | **~$0.06 за запрос** |

При 100 запросах в день ≈ $6/день ≈ $180/мес.

---

## Структура AI-пайплайна

```
Вопрос (любой язык)
    ↓
1. Haiku — перевод на английский
2. PostgreSQL — интроспекция схемы (кэш 5 мин)
    ↓ (параллельно)
3. Sonnet — генерация SQL
4. Валидация (только SELECT/WITH)
5. PostgreSQL — выполнение (таймаут 10 сек)
6. Opus — анализ результата на языке пользователя
7. Автоматический выбор графика (line/bar/pie)
    ↓
Ответ: анализ + таблица + график + SQL
```
