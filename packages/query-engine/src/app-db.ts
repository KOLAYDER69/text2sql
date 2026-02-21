import type { Pool } from "pg";

// ─── User types ───

export type AppUser = {
  id: number;
  telegram_id: string; // bigint comes as string from pg
  username: string | null;
  first_name: string;
  last_name: string | null;
  role: "admin" | "user";
  invited_by: number | null;
  is_vip: boolean;
  can_query: boolean;
  can_invite: boolean;
  can_train: boolean;
  can_schedule: boolean;
  created_at: string;
  last_seen_at: string;
};

export type AppInvite = {
  id: number;
  code: string;
  created_by: number;
  used_by: number | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type AppQueryHistory = {
  id: number;
  user_id: number;
  platform: "web" | "telegram";
  question: string;
  sql: string;
  row_count: number | null;
  execution_ms: number | null;
  error: string | null;
  created_at: string;
};

export type AppSchedule = {
  id: number;
  user_id: number;
  question: string;
  sql: string;
  cron_expr: string;
  label: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

// ─── Users ───

export async function findUserByTelegramId(
  pool: Pool,
  telegramId: number | string,
): Promise<AppUser | null> {
  const { rows } = await pool.query<AppUser>(
    "SELECT * FROM app_users WHERE telegram_id = $1",
    [telegramId],
  );
  return rows[0] ?? null;
}

export async function findUserById(
  pool: Pool,
  id: number,
): Promise<AppUser | null> {
  const { rows } = await pool.query<AppUser>(
    "SELECT * FROM app_users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(
  pool: Pool,
  username: string,
): Promise<AppUser | null> {
  const { rows } = await pool.query<AppUser>(
    "SELECT * FROM app_users WHERE username = $1",
    [username],
  );
  return rows[0] ?? null;
}

export async function searchUsers(
  pool: Pool,
  query: string,
  excludeId?: number,
  limit = 10,
): Promise<AppUser[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<AppUser>(
    `SELECT * FROM app_users
     WHERE (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
     ${excludeId ? "AND id != $3" : ""}
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    excludeId ? [pattern, limit, excludeId] : [pattern, limit],
  );
  return rows;
}

export async function createUser(
  pool: Pool,
  data: {
    telegram_id: number | string;
    username?: string | null;
    first_name: string;
    last_name?: string | null;
    invited_by?: number | null;
  },
): Promise<AppUser> {
  const { rows } = await pool.query<AppUser>(
    `INSERT INTO app_users (telegram_id, username, first_name, last_name, invited_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.telegram_id,
      data.username ?? null,
      data.first_name,
      data.last_name ?? null,
      data.invited_by ?? null,
    ],
  );
  return rows[0];
}

export async function updateLastSeen(
  pool: Pool,
  userId: number,
): Promise<void> {
  await pool.query(
    "UPDATE app_users SET last_seen_at = now() WHERE id = $1",
    [userId],
  );
}

export async function listInvitedUsers(
  pool: Pool,
  userId: number,
): Promise<AppUser[]> {
  const { rows } = await pool.query<AppUser>(
    "SELECT * FROM app_users WHERE invited_by = $1 ORDER BY created_at DESC",
    [userId],
  );
  return rows;
}

export async function updateUserPermissions(
  pool: Pool,
  userId: number,
  perms: {
    is_vip: boolean;
    can_query: boolean;
    can_invite: boolean;
    can_train: boolean;
    can_schedule: boolean;
  },
): Promise<AppUser> {
  const { rows } = await pool.query<AppUser>(
    `UPDATE app_users
     SET is_vip = $2, can_query = $3, can_invite = $4, can_train = $5, can_schedule = $6
     WHERE id = $1
     RETURNING *`,
    [userId, perms.is_vip, perms.can_query, perms.can_invite, perms.can_train, perms.can_schedule],
  );
  return rows[0];
}

// ─── Invites ───

export async function createInvite(
  pool: Pool,
  createdBy: number,
  code: string,
  expiresAt?: Date,
): Promise<AppInvite> {
  const { rows } = await pool.query<AppInvite>(
    `INSERT INTO app_invites (code, created_by, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [code, createdBy, expiresAt ?? null],
  );
  return rows[0];
}

export async function findInviteByCode(
  pool: Pool,
  code: string,
): Promise<AppInvite | null> {
  const { rows } = await pool.query<AppInvite>(
    "SELECT * FROM app_invites WHERE code = $1",
    [code],
  );
  return rows[0] ?? null;
}

export async function useInvite(
  pool: Pool,
  inviteId: number,
  usedBy: number,
): Promise<void> {
  await pool.query(
    "UPDATE app_invites SET used_by = $1, used_at = now() WHERE id = $2",
    [usedBy, inviteId],
  );
}

export async function listInvites(
  pool: Pool,
  createdBy: number,
): Promise<AppInvite[]> {
  const { rows } = await pool.query<AppInvite>(
    "SELECT * FROM app_invites WHERE created_by = $1 ORDER BY created_at DESC",
    [createdBy],
  );
  return rows;
}

// ─── History ───

export async function saveQueryHistory(
  pool: Pool,
  data: {
    user_id: number;
    platform: "web" | "telegram";
    question: string;
    sql: string;
    row_count?: number | null;
    execution_ms?: number | null;
    error?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO app_query_history (user_id, platform, question, sql, row_count, execution_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      data.user_id,
      data.platform,
      data.question,
      data.sql,
      data.row_count ?? null,
      data.execution_ms ?? null,
      data.error ?? null,
    ],
  );
}

export async function getQueryHistory(
  pool: Pool,
  userId: number,
  limit = 20,
): Promise<AppQueryHistory[]> {
  const { rows } = await pool.query<AppQueryHistory>(
    "SELECT * FROM app_query_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit],
  );
  return rows;
}

// ─── Auth Tokens ───

export async function createAuthToken(
  pool: Pool,
  token: string,
): Promise<void> {
  await pool.query(
    "INSERT INTO app_auth_tokens (token) VALUES ($1)",
    [token],
  );
}

export async function authenticateToken(
  pool: Pool,
  token: string,
  userId: number,
): Promise<boolean> {
  const result = await pool.query(
    "UPDATE app_auth_tokens SET user_id = $1, authenticated_at = now() WHERE token = $2 AND user_id IS NULL AND created_at > now() - interval '5 minutes'",
    [userId, token],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function checkAuthToken(
  pool: Pool,
  token: string,
): Promise<{ authenticated: boolean; userId: number | null }> {
  const { rows } = await pool.query<{ user_id: number | null; authenticated_at: string | null }>(
    "SELECT user_id, authenticated_at FROM app_auth_tokens WHERE token = $1 AND created_at > now() - interval '5 minutes'",
    [token],
  );
  if (!rows[0]) return { authenticated: false, userId: null };
  return {
    authenticated: rows[0].authenticated_at !== null,
    userId: rows[0].user_id,
  };
}

// ─── Suggestions ───

export async function saveSuggestions(
  pool: Pool,
  suggestions: string[],
): Promise<void> {
  await pool.query(
    "INSERT INTO app_suggestions (suggestions) VALUES ($1)",
    [JSON.stringify(suggestions)],
  );
}

export async function getLatestSuggestions(
  pool: Pool,
): Promise<string[] | null> {
  const { rows } = await pool.query<{ suggestions: string[] }>(
    "SELECT suggestions FROM app_suggestions ORDER BY created_at DESC LIMIT 1",
  );
  return rows[0]?.suggestions ?? null;
}

// ─── Schedules ───

export async function createSchedule(
  pool: Pool,
  data: {
    user_id: number;
    question: string;
    sql: string;
    cron_expr: string;
    label?: string | null;
  },
): Promise<AppSchedule> {
  const { rows } = await pool.query<AppSchedule>(
    `INSERT INTO app_schedules (user_id, question, sql, cron_expr, label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.user_id, data.question, data.sql, data.cron_expr, data.label ?? null],
  );
  return rows[0];
}

export async function getActiveSchedules(
  pool: Pool,
): Promise<(AppSchedule & { telegram_id: string })[]> {
  const { rows } = await pool.query<AppSchedule & { telegram_id: string }>(
    `SELECT s.*, u.telegram_id
     FROM app_schedules s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.is_active = true`,
  );
  return rows;
}

export async function getUserSchedules(
  pool: Pool,
  userId: number,
): Promise<AppSchedule[]> {
  const { rows } = await pool.query<AppSchedule>(
    "SELECT * FROM app_schedules WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return rows;
}

export async function deactivateSchedule(
  pool: Pool,
  scheduleId: number,
  userId: number,
): Promise<boolean> {
  const result = await pool.query(
    "UPDATE app_schedules SET is_active = false WHERE id = $1 AND user_id = $2",
    [scheduleId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateScheduleRun(
  pool: Pool,
  scheduleId: number,
  error?: string | null,
): Promise<void> {
  await pool.query(
    "UPDATE app_schedules SET last_run_at = now(), last_error = $1 WHERE id = $2",
    [error ?? null, scheduleId],
  );
}

// ─── Favorites ───

export type AppQueryFavorite = {
  id: number;
  user_id: number;
  question: string;
  sql: string;
  created_at: string;
};

export async function addFavorite(
  pool: Pool,
  userId: number,
  question: string,
  sql: string,
): Promise<AppQueryFavorite> {
  const { rows } = await pool.query<AppQueryFavorite>(
    "INSERT INTO app_query_favorites (user_id, question, sql) VALUES ($1, $2, $3) RETURNING *",
    [userId, question, sql],
  );
  return rows[0];
}

export async function removeFavorite(pool: Pool, favoriteId: number, userId: number): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM app_query_favorites WHERE id = $1 AND user_id = $2",
    [favoriteId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserFavorites(pool: Pool, userId: number): Promise<AppQueryFavorite[]> {
  const { rows } = await pool.query<AppQueryFavorite>(
    "SELECT * FROM app_query_favorites WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return rows;
}

// ─── Shared Queries ───

export type AppSharedQuery = {
  id: number;
  token: string;
  user_id: number;
  question: string;
  sql: string;
  rows_json: Record<string, unknown>[];
  fields: string[];
  row_count: number;
  analysis: string | null;
  chart_config: unknown | null;
  created_at: string;
  expires_at: string;
};

export async function createSharedQuery(
  pool: Pool,
  data: {
    token: string;
    user_id: number;
    question: string;
    sql: string;
    rows_json: Record<string, unknown>[];
    fields: string[];
    row_count: number;
    analysis?: string | null;
    chart_config?: unknown | null;
  },
): Promise<AppSharedQuery> {
  const { rows } = await pool.query<AppSharedQuery>(
    `INSERT INTO app_shared_queries (token, user_id, question, sql, rows_json, fields, row_count, analysis, chart_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.token,
      data.user_id,
      data.question,
      data.sql,
      JSON.stringify(data.rows_json),
      data.fields,
      data.row_count,
      data.analysis ?? null,
      data.chart_config ? JSON.stringify(data.chart_config) : null,
    ],
  );
  return rows[0];
}

export async function getSharedQuery(
  pool: Pool,
  token: string,
): Promise<AppSharedQuery | null> {
  const { rows } = await pool.query<AppSharedQuery>(
    "SELECT * FROM app_shared_queries WHERE token = $1 AND expires_at > now()",
    [token],
  );
  return rows[0] ?? null;
}

// ─── Schema Descriptions ───

export type AppSchemaDescription = {
  id: number;
  table_name: string;
  column_name: string | null;
  description: string;
  updated_by: number | null;
  updated_at: string;
};

export async function getAllSchemaDescriptions(
  pool: Pool,
): Promise<AppSchemaDescription[]> {
  const { rows } = await pool.query<AppSchemaDescription>(
    "SELECT * FROM app_schema_descriptions ORDER BY table_name, column_name NULLS FIRST",
  );
  return rows;
}

export async function upsertSchemaDescription(
  pool: Pool,
  data: {
    table_name: string;
    column_name: string | null;
    description: string;
    updated_by: number | null;
  },
): Promise<AppSchemaDescription> {
  if (data.column_name) {
    // Column-level description — use partial index for column IS NOT NULL
    const { rows } = await pool.query<AppSchemaDescription>(
      `INSERT INTO app_schema_descriptions (table_name, column_name, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (table_name, column_name) WHERE column_name IS NOT NULL
       DO UPDATE SET description = $3, updated_by = $4, updated_at = now()
       RETURNING *`,
      [data.table_name, data.column_name, data.description, data.updated_by],
    );
    return rows[0];
  } else {
    // Table-level description — use partial index for column IS NULL
    const { rows } = await pool.query<AppSchemaDescription>(
      `INSERT INTO app_schema_descriptions (table_name, column_name, description, updated_by, updated_at)
       VALUES ($1, NULL, $2, $3, now())
       ON CONFLICT (table_name) WHERE column_name IS NULL
       DO UPDATE SET description = $2, updated_by = $3, updated_at = now()
       RETURNING *`,
      [data.table_name, data.description, data.updated_by],
    );
    return rows[0];
  }
}

export async function deleteSchemaDescription(
  pool: Pool,
  tableName: string,
  columnName: string | null,
): Promise<boolean> {
  const result = columnName
    ? await pool.query(
        "DELETE FROM app_schema_descriptions WHERE table_name = $1 AND column_name = $2",
        [tableName, columnName],
      )
    : await pool.query(
        "DELETE FROM app_schema_descriptions WHERE table_name = $1 AND column_name IS NULL",
        [tableName],
      );
  return (result.rowCount ?? 0) > 0;
}
