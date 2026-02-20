"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/init", { method: "POST" });
      const data = await res.json();

      tokenRef.current = data.token;
      setTelegramUrl(data.telegramUrl);
      setLoading(false);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const check = await fetch(`/api/auth/check?token=${data.token}`);
          const result = await check.json();
          if (result.authenticated) {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push("/");
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="text-center space-y-6 max-w-md px-4">
        <h1 className="text-3xl font-bold">Leads AI — Insights</h1>
        <p className="text-white/50">
          Sign in with Telegram to access the dashboard
        </p>

        {!telegramUrl && !loading && (
          <button
            onClick={startAuth}
            className="bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium px-6 py-3 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            Sign in with Telegram
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 text-white/50">
            <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            Preparing...
          </div>
        )}

        {telegramUrl && (
          <div className="space-y-4">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium px-6 py-3 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Open Telegram to confirm
            </a>

            <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
              <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
              Waiting for confirmation...
            </div>
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
            href="https://t.me/hi_Nickelodeon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            t.me/hi_Nickelodeon
          </a>{" "}
          for an invite link.
        </p>
      </div>
    </div>
  );
}
