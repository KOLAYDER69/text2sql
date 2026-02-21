"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Lang = "ru" | "en";

const translations = {
  // ─── Login ───
  "login.title": { ru: "Leads AI", en: "Leads AI" },
  "login.subtitle": { ru: "Аналитика данных на базе ИИ", en: "AI-powered database analytics" },
  "login.signIn": { ru: "Войти через Telegram", en: "Sign in with Telegram" },
  "login.confirming": { ru: "Подтвердите в Telegram...", en: "Confirm in Telegram..." },
  "login.pressStart": { ru: "Нажмите /start в боте для входа", en: "Press /start in the bot to complete sign-in" },
  "login.openAgain": { ru: "Открыть Telegram снова", en: "Open Telegram again" },
  "login.connectionError": { ru: "Ошибка соединения", en: "Connection error" },
  "login.needAccess": { ru: "Нет доступа?", en: "Need access?" },
  "login.contact": { ru: "Написать @hi_Nickelodeon", en: "Contact @hi_Nickelodeon" },

  // ─── Navigation ───
  "nav.newQuery": { ru: "Новый запрос", en: "New Query" },
  "nav.history": { ru: "История", en: "History" },
  "nav.invites": { ru: "Инвайты", en: "Invites" },
  "nav.profile": { ru: "Профиль", en: "Profile" },
  "nav.queries": { ru: "Запросы", en: "Queries" },
  "nav.back": { ru: "Назад", en: "Back" },
  "nav.logout": { ru: "Выйти", en: "Log out" },

  // ─── Main page ───
  "main.title": { ru: "Задай вопрос о данных", en: "Ask a question about your data" },
  "main.subtitle": { ru: "Введи вопрос на естественном языке — получи SQL и результат", en: "Enter a question in natural language — get SQL and results" },
  "main.placeholder": { ru: "Задай вопрос о данных...", en: "Ask a question about your data..." },
  "main.send": { ru: "Отправить", en: "Send" },
  "main.running": { ru: "Выполняю запрос...", en: "Running query..." },
  "main.stageSQL": { ru: "Генерирую SQL...", en: "Generating SQL..." },
  "main.stageExecute": { ru: "Выполняю запрос...", en: "Executing query..." },
  "main.stageAnalyze": { ru: "Анализирую данные...", en: "Analyzing results..." },
  "main.noHistory": { ru: "Пока нет запросов", en: "No queries yet" },
  "main.noResults": { ru: "Нет результатов", en: "No results" },
  "main.connectionError": { ru: "Ошибка соединения с сервером", en: "Server connection error" },
  "main.error": { ru: "ошибка", en: "error" },
  "main.rows": { ru: "строк", en: "rows" },
  "main.ms": { ru: "мс", en: "ms" },
  "main.analysis": { ru: "Анализ", en: "Analysis" },
  "main.chart": { ru: "График", en: "Chart" },
  "main.refresh": { ru: "Обновить идеи", en: "Refresh ideas" },
  "main.refreshing": { ru: "Генерирую...", en: "Generating..." },
  "main.followUp": { ru: "Задай уточняющий вопрос...", en: "Ask a follow-up question..." },
  "main.thinking": { ru: "Думаю...", en: "Thinking..." },
  "main.clarifying": { ru: "Анализирую вопрос...", en: "Analyzing question..." },
  "main.clarification": { ru: "Уточнение", en: "Clarification" },
  "main.skip": { ru: "Пропустить", en: "Skip" },
  "main.confirm": { ru: "Подтвердить", en: "Confirm" },
  "main.skipped": { ru: "Пропущено", en: "Skipped" },

  // ─── Default suggestions (fallback) ───
  "suggestion.1": { ru: "Покажи топ-5 товаров по цене", en: "Show top 5 products by price" },
  "suggestion.2": { ru: "Сколько заказов в каждом статусе?", en: "How many orders in each status?" },
  "suggestion.3": { ru: "Какой средний чек по городам?", en: "What's the average order value by city?" },
  "suggestion.4": { ru: "Покажи всех клиентов из Москвы", en: "Show all customers from Moscow" },
  "suggestion.5": { ru: "Сравни доходы за январь и февраль", en: "Compare revenue for January and February" },
  "suggestion.6": { ru: "Топ-10 пользователей по количеству операций", en: "Top 10 users by number of operations" },

  // ─── Invites page ───
  "invites.title": { ru: "Инвайты", en: "Invites" },
  "invites.subtitle": { ru: "Создавай ссылки для приглашения новых пользователей", en: "Create links to invite new users" },
  "invites.create": { ru: "+ Новый инвайт", en: "+ New Invite" },
  "invites.creating": { ru: "Создаю...", en: "Creating..." },
  "invites.total": { ru: "Всего", en: "Total" },
  "invites.active": { ru: "Активных", en: "Active" },
  "invites.used": { ru: "Использовано", en: "Used" },
  "invites.expired": { ru: "Истекло", en: "Expired" },
  "invites.empty": { ru: "Нет инвайтов", en: "No invites" },
  "invites.emptyHint": { ru: "Создай первый инвайт, чтобы пригласить пользователя", en: "Create your first invite to add a user" },
  "invites.colCode": { ru: "Код", en: "Code" },
  "invites.colStatus": { ru: "Статус", en: "Status" },
  "invites.colCreated": { ru: "Создан", en: "Created" },
  "invites.colExpires": { ru: "Истекает", en: "Expires" },
  "invites.colLink": { ru: "Ссылка", en: "Link" },
  "invites.statusUsed": { ru: "Использован", en: "Used" },
  "invites.statusExpired": { ru: "Истёк", en: "Expired" },
  "invites.statusActive": { ru: "Активен", en: "Active" },
  "invites.copied": { ru: "Скопировано!", en: "Copied!" },
  "invites.copy": { ru: "Копировать", en: "Copy" },
  "invites.newReady": { ru: "Инвайт создан!", en: "Invite ready!" },
  "invites.linkLabel": { ru: "Ссылка для приглашения", en: "Invite link" },
  "invites.howItWorks": { ru: "Отправьте эту ссылку — получатель нажмёт Start в боте и получит доступ", en: "Share this link — recipient taps Start in the bot and gets access" },
  "invites.dismiss": { ru: "Скрыть", en: "Dismiss" },
  "invites.copyLink": { ru: "Копировать ссылку", en: "Copy link" },

  // ─── Profile page ───
  "profile.title": { ru: "Профиль", en: "Profile" },
  "profile.stats": { ru: "Статистика", en: "Statistics" },
  "profile.totalQueries": { ru: "Запросов", en: "Queries" },
  "profile.successful": { ru: "Успешных", en: "Successful" },
  "profile.errors": { ru: "Ошибок", en: "Errors" },
  "profile.avgTime": { ru: "Среднее время", en: "Avg. time" },
  "profile.totalRows": { ru: "Строк всего", en: "Total rows" },
  "profile.webTelegram": { ru: "Web / Telegram", en: "Web / Telegram" },
  "profile.activity": { ru: "Активность (7 дней)", en: "Activity (7 days)" },
  "profile.askQuestion": { ru: "Задать вопрос", en: "Ask a question" },
  "profile.manageAccess": { ru: "Управление доступом", en: "Manage access" },

  // ─── Training page ───
  "nav.training": { ru: "Обучение", en: "Training" },
  "training.title": { ru: "Обучение схемы", en: "Schema Training" },
  "training.subtitle": { ru: "Опишите таблицы и колонки — AI будет лучше понимать данные", en: "Describe tables and columns — AI will understand data better" },
  "training.tablePlaceholder": { ru: "Описание таблицы...", en: "Table description..." },
  "training.columnPlaceholder": { ru: "Описание колонки...", en: "Column description..." },
  "training.saved": { ru: "Сохранено", en: "Saved" },
  "training.saving": { ru: "Сохранение...", en: "Saving..." },
  "training.columns": { ru: "колонок", en: "columns" },
  "training.described": { ru: "описано", en: "described" },
  "training.searchPlaceholder": { ru: "Поиск таблицы...", en: "Search tables..." },
  "training.adminOnly": { ru: "Только администраторы могут редактировать описания", en: "Only admins can edit descriptions" },
  "training.stats": { ru: "Покрытие", en: "Coverage" },
  "training.tables": { ru: "таблиц", en: "tables" },
  "training.startTraining": { ru: "Запустить обучение", en: "Start Training" },
  "training.wizardCard": { ru: "Карточка", en: "Card" },
  "training.wizardOf": { ru: "из", en: "of" },
  "training.wizardSuggestions": { ru: "Предложения AI", en: "AI Suggestions" },
  "training.wizardGenerating": { ru: "Генерирую варианты...", en: "Generating suggestions..." },
  "training.wizardCustom": { ru: "Своё описание...", en: "Custom description..." },
  "training.wizardSave": { ru: "Сохранить", en: "Save" },
  "training.wizardTableLevel": { ru: "Таблица", en: "Table" },
  "training.wizardColumnLevel": { ru: "Колонка", en: "Column" },
  "training.wizardComplete": { ru: "Обучение завершено!", en: "Training complete!" },
  "training.wizardEmpty": { ru: "Нет незаполненных описаний", en: "No empty descriptions" },
  "training.wizardSkip": { ru: "Пропустить", en: "Skip" },

  // ─── User management (invites page) ───
  "users.title": { ru: "Мои пользователи", en: "My Users" },
  "users.empty": { ru: "Пока нет приглашённых пользователей", en: "No invited users yet" },
  "users.emptyHint": { ru: "Создайте инвайт и отправьте ссылку", en: "Create an invite and share the link" },
  "users.colName": { ru: "Имя", en: "Name" },
  "users.colJoined": { ru: "Дата", en: "Joined" },
  "users.colPermissions": { ru: "Разрешения", en: "Permissions" },
  "users.lastSeen": { ru: "Был", en: "Seen" },

  // ─── Permissions ───
  "perm.query": { ru: "Запросы", en: "Queries" },
  "perm.invite": { ru: "Инвайты", en: "Invites" },
  "perm.train": { ru: "Обучение", en: "Training" },
  "perm.schedule": { ru: "Расписание", en: "Schedules" },
  "perm.vip": { ru: "VIP", en: "VIP" },
  "perm.title": { ru: "Разрешения", en: "Permissions" },
  "perm.granted": { ru: "Разрешено", en: "Granted" },
  "perm.denied": { ru: "Запрещено", en: "Denied" },

  // ─── Language ───
  "lang.ru": { ru: "Русский", en: "Russian" },
  "lang.en": { ru: "English", en: "English" },
} as const;

export type TranslationKey = keyof typeof translations;

type I18nContext = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
};

const I18nCtx = createContext<I18nContext>({
  lang: "ru",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("qb_lang") as Lang | null;
    if (saved && (saved === "ru" || saved === "en")) {
      setLangState(saved);
    }
    setMounted(true);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("qb_lang", l);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[lang] ?? entry.ru;
    },
    [lang],
  );

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <I18nCtx.Provider value={{ lang: "ru", setLang, t: (key) => translations[key]?.ru ?? key }}>
        {children}
      </I18nCtx.Provider>
    );
  }

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}

/** Language switcher component */
export function LangSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <button
      onClick={() => setLang(lang === "ru" ? "en" : "ru")}
      className={`text-xs text-white/30 hover:text-white/60 transition font-mono ${className ?? ""}`}
      title={lang === "ru" ? "Switch to English" : "Переключить на русский"}
    >
      {lang === "ru" ? "EN" : "RU"}
    </button>
  );
}
