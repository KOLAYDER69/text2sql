"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inviteCode = searchParams.get("invite");

  const handleTelegramAuth = useCallback(
    async (user: Record<string, unknown>) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...user,
            inviteCode: inviteCode || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === "no_account") {
            setError(
              "У вас нет аккаунта. Попросите инвайт-код у @Nickelodeon",
            );
          } else if (data.error === "invalid_invite") {
            setError("Инвайт-код недействителен или уже использован.");
          } else {
            setError(data.error || "Ошибка авторизации");
          }
          setLoading(false);
          return;
        }

        router.push("/");
      } catch {
        setError("Ошибка соединения с сервером");
        setLoading(false);
      }
    },
    [inviteCode, router],
  );

  useEffect(() => {
    // Expose callback to global scope for Telegram widget
    (window as unknown as Record<string, unknown>).onTelegramAuth =
      handleTelegramAuth;

    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
    if (!botName || !widgetRef.current) return;

    // Load Telegram Login Widget script
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    widgetRef.current.innerHTML = "";
    widgetRef.current.appendChild(script);
  }, [handleTelegramAuth]);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="text-center space-y-6 max-w-md px-4">
        <h1 className="text-3xl font-bold">QueryBot</h1>
        <p className="text-white/50">
          Войдите через Telegram для доступа к данным
        </p>

        {inviteCode && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-400 text-sm">
            Инвайт-код: <code className="font-mono">{inviteCode}</code>
          </div>
        )}

        <div ref={widgetRef} className="flex justify-center" />

        {loading && (
          <div className="flex items-center justify-center gap-2 text-white/50">
            <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            Авторизация...
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-white/30">
          Нет аккаунта? Свяжитесь с{" "}
          <a
            href="https://t.me/Nickelodeon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            @Nickelodeon
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin h-6 w-6 border-2 border-white/30 border-t-white rounded-full" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
