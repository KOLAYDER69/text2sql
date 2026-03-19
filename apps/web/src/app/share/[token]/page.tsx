"use client";

import { useState, useEffect, use } from "react";
import { QueryChart } from "../../chart";

type ChartDataset = { label: string; data: number[] };
type ChartConfig = {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: ChartDataset[];
};

type SharedData = {
  question: string;
  sql: string;
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
  analysis?: string;
  chart?: ChartConfig;
  createdAt: string;
  expiresAt: string;
};

function formatAnalysis(text: string): string {
  const tags: string[] = [];
  let out = text.replace(/<\/?(b|i|code)>/gi, (match) => {
    tags.push(match);
    return `\x00${tags.length - 1}\x00`;
  });
  out = out
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  out = out.replace(/\x00(\d+)\x00/g, (_, idx) => {
    const tag = tags[Number(idx)];
    return tag
      .replace(/<b>/gi, '<strong class="text-white">')
      .replace(/<\/b>/gi, "</strong>")
      .replace(/<i>/gi, "<em>")
      .replace(/<\/i>/gi, "</em>")
      .replace(/<code>/gi, '<code class="bg-white/10 px-1 rounded text-blue-300">')
      .replace(/<\/code>/gi, "</code>");
  });
  out = out.replace(/^#{1,3}\s+(.+)$/gm, '<strong class="text-white block mt-3 mb-1">$1</strong>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
  out = out.replace(/__(.+?)__/g, '<strong class="text-white">$1</strong>');
  out = out.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1 rounded text-blue-300">$1</code>');
  out = out.replace(/^[-—]\s+/gm, "• ");
  out = out.replace(/\n\n/g, '</p><p class="mt-2">');
  out = `<p>${out}</p>`;
  return out;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">404</p>
          <p className="text-white/40">This shared query has expired or does not exist.</p>
          <a href="/" className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300 transition">
            Open text2SQL
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider font-medium mb-1">Shared Query</p>
            <h1 className="text-lg font-semibold">{data.question}</h1>
          </div>
          <a
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 transition shrink-0"
          >
            Open text2SQL
          </a>
        </div>

        <div className="flex gap-3 text-xs text-white/30">
          <span>
            {new Date(data.createdAt).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <span>
            Expires: {new Date(data.expiresAt).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>

        {/* Analysis */}
        {data.analysis && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
            <p className="text-xs text-blue-400/60 uppercase tracking-wider font-medium mb-2">Analysis</p>
            <div
              className="text-sm text-white/80 leading-relaxed analysis-content"
              dangerouslySetInnerHTML={{ __html: formatAnalysis(data.analysis) }}
            />
          </div>
        )}

        {/* Table */}
        {data.rows && data.rows.length > 0 && data.fields && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10">
              <span className="text-xs text-white/40">
                {data.rowCount} rows
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {data.fields.map((f) => (
                      <th
                        key={f}
                        className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                      >
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`border-b border-white/5 ${ri % 2 === 1 ? "bg-white/[0.015]" : ""}`}
                    >
                      {data.fields.map((f) => (
                        <td key={f} className="px-4 py-2 font-mono text-sm whitespace-nowrap">
                          {String(row[f] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chart */}
        {data.chart && <QueryChart config={data.chart} />}

        {/* SQL */}
        {data.sql && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10">
              <span className="text-xs text-white/40 uppercase tracking-wider font-medium">SQL</span>
            </div>
            <pre className="p-4 text-sm font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
              {data.sql}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
