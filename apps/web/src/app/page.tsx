"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  fields?: string[];
  rowCount?: number;
  executionMs?: number;
  error?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.error || `${data.rowCount} строк за ${data.executionMs}мс`,
          sql: data.sql,
          rows: data.rows,
          fields: data.fields,
          rowCount: data.rowCount,
          executionMs: data.executionMs,
          error: data.error,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Ошибка соединения с сервером", error: "connection" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="border-b border-white/10 p-4">
        <h1 className="text-xl font-semibold">QueryBot</h1>
        <p className="text-sm text-white/50">
          Задай вопрос о данных на естественном языке
        </p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-white/30 mt-20">
            <p className="text-lg mb-4">Примеры запросов:</p>
            <div className="space-y-2">
              {[
                "Покажи топ-5 товаров по цене",
                "Сколько заказов в каждом статусе?",
                "Какой средний чек по городам?",
                "Show all customers from Moscow",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block mx-auto px-4 py-2 rounded-lg border border-white/10 hover:border-white/30 transition text-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="bg-blue-600 rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-full">
                {/* SQL */}
                {msg.sql && (
                  <div className="bg-white/5 rounded-lg p-3 overflow-x-auto">
                    <div className="text-xs text-white/40 mb-1">SQL</div>
                    <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap">
                      {msg.sql}
                    </pre>
                  </div>
                )}

                {/* Error */}
                {msg.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
                    {msg.error}
                  </div>
                )}

                {/* Results table */}
                {msg.rows && msg.rows.length > 0 && msg.fields && (
                  <div className="bg-white/5 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          {msg.fields.map((f) => (
                            <th
                              key={f}
                              className="text-left p-2 text-white/60 font-medium"
                            >
                              {f}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.rows.map((row, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-white/5 hover:bg-white/5"
                          >
                            {msg.fields!.map((f) => (
                              <td key={f} className="p-2 font-mono">
                                {String(row[f] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Stats */}
                {!msg.error && msg.rowCount !== undefined && (
                  <div className="text-xs text-white/30">
                    {msg.rowCount} строк &middot; {msg.executionMs}мс
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-white/50">
            <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            Выполняю запрос...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Задай вопрос о данных..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition"
          >
            Отправить
          </button>
        </div>
      </form>
    </div>
  );
}
