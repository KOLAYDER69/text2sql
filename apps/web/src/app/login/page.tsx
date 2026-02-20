"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n, LangSwitcher } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const telegramUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Init token once, then reuse on re-clicks
  const initToken = useCallback(async () => {
    if (tokenRef.current) return; // already have a token

    const res = await fetch("/api/auth/init", { method: "POST" });
    const data = await res.json();
    tokenRef.current = data.token;
    telegramUrlRef.current = data.telegramUrl;

    // Start polling (once)
    pollRef.current = setInterval(async () => {
      try {
        const check = await fetch(`/api/auth/check?token=${tokenRef.current}`);
        const result = await check.json();
        if (result.authenticated) {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push("/");
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  }, [router]);

  const startAuth = useCallback(async () => {
    setError(null);

    try {
      await initToken();
      window.open(telegramUrlRef.current!, "_blank");
      setPolling(true);
    } catch {
      setError(t("login.connectionError"));
    }
  }, [initToken, t]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Animated background ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let w = 0;
    let h = 0;

    type Digit = { x: number; y: number; char: string; speed: number; opacity: number; size: number };
    const digits: Digit[] = [];
    const DIGIT_COUNT = 60;

    let planetAngle = 0;
    const planetDots: { lat: number; lon: number; size: number }[] = [];
    for (let i = 0; i < 200; i++) {
      planetDots.push({
        lat: (Math.random() - 0.5) * Math.PI,
        lon: Math.random() * Math.PI * 2,
        size: Math.random() * 1.5 + 0.5,
      });
    }

    function resize() {
      w = canvas!.width = window.innerWidth;
      h = canvas!.height = window.innerHeight;
      digits.length = 0;
      for (let i = 0; i < DIGIT_COUNT; i++) {
        digits.push(makeDigit(true));
      }
    }

    function makeDigit(randomY: boolean): Digit {
      return {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : -20,
        char: String(Math.floor(Math.random() * 10)),
        speed: Math.random() * 0.8 + 0.2,
        opacity: Math.random() * 0.15 + 0.03,
        size: Math.random() * 14 + 10,
      };
    }

    function drawPlanet() {
      const cx = w * 0.5;
      const cy = h * 0.45;
      const r = Math.min(w, h) * 0.36;

      const glow = ctx!.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.6);
      glow.addColorStop(0, "rgba(59,130,246,0.06)");
      glow.addColorStop(1, "rgba(59,130,246,0)");
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.strokeStyle = "rgba(59,130,246,0.15)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.stroke();

      for (let i = -2; i <= 2; i++) {
        const yOffset = (i / 3) * r;
        const localR = Math.sqrt(r * r - yOffset * yOffset);
        if (localR <= 0) continue;
        ctx!.strokeStyle = `rgba(59,130,246,${0.06 - Math.abs(i) * 0.015})`;
        ctx!.beginPath();
        ctx!.ellipse(cx, cy + yOffset, localR, localR * 0.15, 0, 0, Math.PI * 2);
        ctx!.stroke();
      }

      for (const dot of planetDots) {
        const x3d = Math.cos(dot.lat) * Math.sin(dot.lon + planetAngle);
        const y3d = Math.sin(dot.lat);
        const z3d = Math.cos(dot.lat) * Math.cos(dot.lon + planetAngle);
        if (z3d < -0.1) continue;
        const sx = cx + x3d * r;
        const sy = cy + y3d * r;
        const brightness = 0.05 + z3d * 0.12;
        ctx!.fillStyle = `rgba(147,197,253,${brightness})`;
        ctx!.beginPath();
        ctx!.arc(sx, sy, dot.size * (0.5 + z3d * 0.5), 0, Math.PI * 2);
        ctx!.fill();
      }

      for (let m = 0; m < 6; m++) {
        const mAngle = (m / 6) * Math.PI * 2 + planetAngle;
        ctx!.strokeStyle = "rgba(59,130,246,0.05)";
        ctx!.beginPath();
        for (let tt = -Math.PI / 2; tt <= Math.PI / 2; tt += 0.05) {
          const x3d = Math.cos(tt) * Math.sin(mAngle);
          const z3d = Math.cos(tt) * Math.cos(mAngle);
          if (z3d < -0.05) continue;
          const sx = cx + x3d * r;
          const sy = cy + Math.sin(tt) * r;
          if (tt === -Math.PI / 2 || z3d < 0) {
            ctx!.moveTo(sx, sy);
          } else {
            ctx!.lineTo(sx, sy);
          }
        }
        ctx!.stroke();
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.font = "monospace";
      for (const d of digits) {
        ctx!.font = `${d.size}px monospace`;
        ctx!.fillStyle = `rgba(59,130,246,${d.opacity})`;
        ctx!.fillText(d.char, d.x, d.y);
        d.y += d.speed;
        if (d.y > h + 20) Object.assign(d, makeDigit(false));
        if (Math.random() < 0.005) d.char = String(Math.floor(Math.random() * 10));
      }
      drawPlanet();
      planetAngle += 0.003;
      animationId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />

      {/* Language switcher */}
      <div className="absolute top-4 right-4 z-20">
        <LangSwitcher />
      </div>

      <div className="relative z-10 text-center space-y-6 max-w-md px-4">
        <h1 className="text-4xl font-bold tracking-tight">
          {t("login.title")}
        </h1>
        <p className="text-white/40 text-sm">
          {t("login.subtitle")}
        </p>

        {!polling && (
          <button
            onClick={startAuth}
            className="bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium px-8 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-2.5 shadow-lg shadow-[#2AABEE]/20"
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
            {t("login.signIn")}
          </button>
        )}

        {polling && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-center gap-2.5 text-white/60 text-sm">
                <div className="animate-spin h-4 w-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full" />
                {t("login.confirming")}
              </div>
              <p className="text-white/25 text-xs mt-3">
                {t("login.pressStart")}
              </p>
            </div>
            <button
              onClick={startAuth}
              className="text-white/30 hover:text-white/60 text-xs transition underline underline-offset-2"
            >
              {t("login.openAgain")}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-white/20">
          {t("login.needAccess")}{" "}
          <a
            href="https://t.me/hi_Nickelodeon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400/60 hover:text-blue-400 transition"
          >
            {t("login.contact")}
          </a>
        </p>
      </div>
    </div>
  );
}
