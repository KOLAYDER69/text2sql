import crypto from "node:crypto";

export type TelegramLoginData = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/**
 * Verify Telegram Login Widget data using HMAC-SHA256.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(
  data: TelegramLoginData,
  botToken: string,
): boolean {
  const { hash, ...rest } = data;

  // Build check string: sorted key=value pairs joined by \n
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k as keyof typeof rest]}`)
    .join("\n");

  // Secret key = SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // HMAC-SHA256 of the check string
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  if (hmac !== hash) return false;

  // Check auth_date is not too old (allow 1 hour)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 3600) return false;

  return true;
}
