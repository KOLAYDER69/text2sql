import { Router } from "express";
import type { Pool } from "pg";
import { createDriver } from "@querybot/engine";

export function createSetupRouter(appPool: Pool) {
  const router = Router();

  // Check if configured
  router.get("/status", async (_req, res) => {
    try {
      const result = await appPool.query(
        "SELECT value FROM app_config WHERE key = 'database_url'"
      );
      const configured = result.rows.length > 0 && !!result.rows[0].value;

      // Also check API key
      const keyResult = await appPool.query(
        "SELECT value FROM app_config WHERE key = 'anthropic_api_key'"
      );
      const hasKey = keyResult.rows.length > 0 && !!keyResult.rows[0].value;

      res.json({
        configured: configured && hasKey,
        hasDatabaseUrl: configured,
        hasApiKey: hasKey,
        dockerMode: true,
      });
    } catch {
      // Table might not exist yet
      res.json({ configured: false, dockerMode: true });
    }
  });

  // Test database connection
  router.post("/test-connection", async (req, res) => {
    const { databaseUrl } = req.body;
    if (!databaseUrl) {
      return res.status(400).json({ error: "databaseUrl is required" });
    }

    try {
      const driver = await createDriver(databaseUrl);
      const schema = await driver.introspect();
      await driver.close();

      res.json({
        success: true,
        tables: schema.tables.length,
        tableNames: schema.tables.map((t) => t.name),
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  });

  // Save configuration
  router.post("/configure", async (req, res) => {
    const { databaseUrl, anthropicApiKey, adminPassword } = req.body;

    if (!databaseUrl || !anthropicApiKey) {
      return res.status(400).json({ error: "databaseUrl and anthropicApiKey are required" });
    }

    try {
      // Test connection first
      const driver = await createDriver(databaseUrl);
      await driver.introspect();
      await driver.close();

      // Save config
      await appPool.query(
        `INSERT INTO app_config (key, value, updated_at) VALUES ('database_url', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [databaseUrl]
      );

      await appPool.query(
        `INSERT INTO app_config (key, value, updated_at) VALUES ('anthropic_api_key', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [anthropicApiKey]
      );

      // Update admin password if provided
      if (adminPassword) {
        await appPool.query(
          "UPDATE app_users SET password_hash = $1 WHERE username = 'admin'",
          [adminPassword]
        );
      }

      // Set env vars for current process
      process.env.DATABASE_URL = databaseUrl;
      process.env.ANTHROPIC_API_KEY = anthropicApiKey;

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Configuration failed",
      });
    }
  });

  // Simple password login for Docker mode
  router.post("/login", async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    try {
      const result = await appPool.query(
        "SELECT * FROM app_users WHERE username = 'admin' AND password_hash = $1",
        [password]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Wrong password" });
      }

      const user = result.rows[0];

      // Create JWT
      const { SignJWT } = await import("jose");
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || "docker-secret");
      const token = await new SignJWT({
        userId: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        role: user.role,
        permissions: {
          canQuery: user.can_query,
          canInvite: user.can_invite,
          canTrain: user.can_train,
          canSchedule: user.can_schedule,
          isVip: user.is_vip,
        },
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(secret);

      res.cookie("session", token, {
        httpOnly: true,
        secure: false, // Docker is usually HTTP
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Login failed" });
    }
  });

  return router;
}
