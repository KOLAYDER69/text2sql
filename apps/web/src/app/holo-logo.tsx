"use client";

import { useEffect, useRef } from "react";

const DIGITS = "0123456789";
const COLS = 30;
const ROWS = 10;
const MASK_SCALE = 12; // render mask at 12x for clean text

/**
 * Holographic "Leads AI" logo assembled from floating digits.
 * Digits forming the text glow cyan; background digits stay very dim.
 */
export function HoloLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const w = size === "sm" ? 130 : 176;
  const h = size === "sm" ? 40 : 52;
  const fontSize = size === "sm" ? 4.5 : 5.5;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-res mask — render text at 360×120 then sample per grid cell
    const MASK_W = COLS * MASK_SCALE;
    const MASK_H = ROWS * MASK_SCALE;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = MASK_W;
    maskCanvas.height = MASK_H;
    const maskCtx = maskCanvas.getContext("2d")!;
    maskCtx.fillStyle = "#000";
    maskCtx.fillRect(0, 0, MASK_W, MASK_H);
    maskCtx.fillStyle = "#fff";
    maskCtx.textAlign = "center";
    maskCtx.textBaseline = "middle";

    // Title — bold, ~42% of mask height ≈ 50px
    maskCtx.font = `bold ${Math.floor(MASK_H * 0.42)}px sans-serif`;
    maskCtx.fillText("LEADS AI", MASK_W / 2, MASK_H * 0.36);

    // Subtitle — ~17% ≈ 20px
    maskCtx.font = `${Math.floor(MASK_H * 0.17)}px sans-serif`;
    maskCtx.fillText("Ask & Get data", MASK_W / 2, MASK_H * 0.76);

    const maskData = maskCtx.getImageData(0, 0, MASK_W, MASK_H).data;

    // Sample mask at grid cell center
    function isMask(col: number, row: number): boolean {
      const mx = Math.floor((col + 0.5) * MASK_SCALE);
      const my = Math.floor((row + 0.5) * MASK_SCALE);
      return maskData[(my * MASK_W + mx) * 4] > 128;
    }

    // Pre-compute which cells are text (static)
    const textMask: boolean[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        textMask.push(isMask(c, r));
      }
    }

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
          const gi = row * COLS + col;
          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;

          // Randomly mutate some digits
          if (Math.random() < 0.02) {
            grid[gi] = DIGITS[Math.floor(Math.random() * DIGITS.length)];
          }

          if (textMask[gi]) {
            // Text digit — bright pulsing cyan
            const pulse = Math.sin(time * 0.003 + col * 0.3 + row * 0.2);
            const alpha = 0.82 + pulse * 0.18;
            const hue = 195 + pulse * 12;
            ctx.fillStyle = `hsla(${hue}, 85%, 72%, ${alpha})`;
          } else {
            // Background — very dim flicker
            const flicker = Math.sin(time * 0.001 + col * 1.7 + row * 2.3) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(100, 200, 255, ${0.03 + flicker * 0.05})`;
          }

          ctx.fillText(grid[gi], cx, cy);
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
      <div className="absolute inset-0 pointer-events-none holo-scanlines" />
      <div className="absolute inset-0 pointer-events-none rounded-lg holo-glow" />
    </div>
  );
}
