"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

function LoginContent() {
  const router = useRouter();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTelegramAuth = useCallback(
    async (user: Record<string, unknown>) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === "no_account") {
            setError(
              "You don't have access yet. Ask for an invite link and activate it via Telegram first.",
            );
          } else {
            setError(data.error || "Authentication error");
          }
          setLoading(false);
          return;
        }

        router.push("/");
      } catch {
        setError("Connection error");
        setLoading(false);
      }
    },
    [router],
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
        <h1 className="text-3xl font-bold">Leads AI — Insights</h1>
        <p className="text-white/50">
          Sign in with Telegram to access the dashboard
        </p>

        <div ref={widgetRef} className="flex justify-center" />

        {loading && (
          <div className="flex items-center justify-center gap-2 text-white/50">
            <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            Signing in...
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-white/30">
          Don&apos;t have access? Contact{" "}
          <a
            href="https://t.me/Nickelodeon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            @Nickelodeon
          </a>{" "}
          for an invite link.
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
