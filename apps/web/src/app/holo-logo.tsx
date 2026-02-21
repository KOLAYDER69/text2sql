"use client";

import { useEffect, useRef } from "react";

const DIGITS = "0123456789";
const COLS = 22;
const ROWS = 12;

/**
 * Holographic "Leads AI" logo assembled from floating digits.
 * Pure CSS + a tiny canvas for the digit matrix.
 */
export function HoloLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const w = size === "sm" ? 120 : 160;
  const h = size === "sm" ? 48 : 56;
  const fontSize = size === "sm" ? 5.5 : 7;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pre-generate the "LEADS AI" mask at higher density
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = COLS;
    maskCanvas.height = ROWS;
    const maskCtx = maskCanvas.getContext("2d")!;
    maskCtx.fillStyle = "#000";
    maskCtx.fillRect(0, 0, COLS, ROWS);
    maskCtx.fillStyle = "#fff";
    maskCtx.font = `bold ${Math.floor(ROWS * 0.48)}px sans-serif`;
    maskCtx.textAlign = "center";
    maskCtx.textBaseline = "middle";
    maskCtx.fillText("LEADS AI", COLS / 2, ROWS * 0.38);

    // Subtitle
    maskCtx.font = `${Math.floor(ROWS * 0.25)}px sans-serif`;
    maskCtx.fillText("Ask & Get data", COLS / 2, ROWS * 0.78);

    const maskData = maskCtx.getImageData(0, 0, COLS, ROWS).data;

    // Grid of digit chars — randomize periodically
    const grid: string[] = Array.from(
      { length: COLS * ROWS },
      () => DIGITS[Math.floor(Math.random() * DIGITS.length)],
    );

    function render(time: number) {
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cellW = w / COLS;
      const cellH = h / ROWS;

      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = (row * COLS + col) * 4;
          const isText = maskData[idx] > 128;

          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;

          // Randomly mutate some digits
          if (Math.random() < 0.02) {
            grid[row * COLS + col] =
              DIGITS[Math.floor(Math.random() * DIGITS.length)];
          }

          const char = grid[row * COLS + col];

          if (isText) {
            // Text glow — pulsing cyan/blue
            const pulse = Math.sin(time * 0.003 + col * 0.3 + row * 0.2);
            const alpha = 0.75 + pulse * 0.25;
            const hue = 190 + pulse * 15;
            ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha})`;
            ctx.fillText(char, cx, cy);
          } else {
            // Background matrix — very dim
            const flicker =
              Math.sin(time * 0.001 + col * 1.7 + row * 2.3) * 0.5 + 0.5;
            const alpha = 0.04 + flicker * 0.06;
            ctx.fillStyle = `rgba(100, 200, 255, ${alpha})`;
            ctx.fillText(char, cx, cy);
          }
        }
      }

      frameRef.current = requestAnimationFrame(render);
    }

    frameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameRef.current);
  }, [w, h, fontSize]);

  return (
    <div className="holo-logo-wrap relative select-none" style={{ width: w, height: h }}>
      <canvas
        ref={canvasRef}
        style={{ width: w, height: h }}
        className="block"
      />
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none holo-scanlines" />
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none rounded-lg holo-glow" />
    </div>
  );
}
