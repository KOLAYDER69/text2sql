"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Feature = {
  id: number;
  user_id: number;
  username: string | null;
  first_name: string;
  page: string;
  description: string;
  status: "open" | "done" | "rejected";
  admin_comment: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Open" },
  done: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Done" },
  rejected: { bg: "bg-white/5", text: "text-white/30", label: "Rejected" },
};

export function FeatureWidget({ userRole }: { userRole?: string }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cHeld, setCHeld] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isAdmin = userRole === "admin";

  const loadFeatures = useCallback(async () => {
    try {
      const res = await fetch("/api/features");
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  // C key tracking
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C" || e.key === "с" || e.key === "С") {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
          setCHeld(true);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C" || e.key === "с" || e.key === "С") {
        setCHeld(false);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // Click while C held
  useEffect(() => {
    if (!cHeld) return;
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPopup({ x: e.clientX, y: e.clientY });
      setText("");
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [cHeld]);

  async function submitFeature() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: window.location.pathname,
          x: popup?.x ?? 0,
          y: popup?.y ?? 0,
          description: text.trim(),
        }),
      });
      setPopup(null);
      setText("");
      loadFeatures();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/features/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadFeatures();
  }

  const openCount = features.filter((f) => f.status === "open").length;

  return (
    <>
      {/* C-held cursor indicator */}
      {cHeld && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <style>{`* { cursor: crosshair !important; }`}</style>
        </div>
      )}

      {/* Click popup */}
      {popup && (
        <div
          className="fixed z-[9999] bg-[#111] border border-white/15 rounded-xl shadow-2xl p-3 w-72"
          style={{ left: Math.min(popup.x, window.innerWidth - 300), top: Math.min(popup.y, window.innerHeight - 200) }}
        >
          <p className="text-xs text-white/40 mb-2">Feature request</p>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) submitFeature(); if (e.key === "Escape") setPopup(null); }}
            placeholder="What should be improved here?"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={submitFeature}
              disabled={submitting || !text.trim()}
              className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs transition disabled:opacity-50"
            >
              {submitting ? "..." : "Send (Cmd+Enter)"}
            </button>
            <button
              onClick={() => setPopup(null)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/40 transition"
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* Floating button to open panel */}
      <button
        onClick={() => { setPanelOpen(!panelOpen); if (!panelOpen) loadFeatures(); }}
        className="fixed bottom-4 left-4 z-[9990] bg-[#111] border border-white/10 rounded-full w-10 h-10 flex items-center justify-center hover:bg-white/10 transition group"
        title="Feature requests (hold C + click to add)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 13l1.5-4.5L11 1l2 2-7.5 7.5z" />
          <path d="M9 3l2 2" />
        </svg>
        {openCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {openCount}
          </span>
        )}
      </button>

      {/* Side panel */}
      {panelOpen && (
        <div className="fixed inset-y-0 left-0 z-[9995] w-80 bg-[#0d0d0d] border-r border-white/10 flex flex-col shadow-2xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Feature Requests</h3>
              <p className="text-xs text-white/30 mt-0.5">Hold C + click to add</p>
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-white/30 hover:text-white/60 transition text-lg">&times;</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {features.length === 0 && (
              <p className="text-white/20 text-sm text-center py-8">No requests yet</p>
            )}
            {features.map((f) => {
              const s = STATUS_STYLE[f.status];
              return (
                <div key={f.id} className={`border border-white/5 rounded-xl p-3 ${f.status === "open" ? "bg-white/[0.03]" : "bg-white/[0.01] opacity-60"}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${f.status === "rejected" ? "line-through text-white/30" : ""}`}>
                        {f.description}
                      </p>
                      <p className="text-xs text-white/20 mt-1">
                        {f.first_name}{f.username ? ` @${f.username}` : ""} &middot; {f.page} &middot; {new Date(f.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.bg} ${s.text} shrink-0`}>
                      {s.label}
                    </span>
                  </div>
                  {isAdmin && f.status === "open" && (
                    <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/5">
                      <button
                        onClick={() => updateStatus(f.id, "done")}
                        className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => updateStatus(f.id, "rejected")}
                        className="text-[11px] px-2 py-1 rounded bg-white/5 text-white/30 hover:bg-white/10 hover:text-red-400 transition"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
