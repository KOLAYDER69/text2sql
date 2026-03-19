"use client";

import { useState } from "react";

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("admin");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/setup/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseUrl }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) setStep(2);
    } catch {
      setTestResult({ success: false, error: "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/setup/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseUrl, anthropicApiKey: apiKey, adminPassword: password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Login
      const loginRes = await fetch("/api/setup/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const loginData = await loginRes.json();
      if (!loginData.success) throw new Error(loginData.error);

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">text2SQL</h1>
          <p className="text-white/40">Setup wizard</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-blue-600 text-white" : "bg-white/10 text-white/30"
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-blue-600" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Database URL */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">Database URL</label>
              <input
                type="text"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="postgresql://user:pass@host:5432/mydb"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-xs text-white/30 mt-2">
                PostgreSQL, MySQL or SQLite. This is the database you want to query.
              </p>
            </div>

            {testResult && (
              <div className={`p-3 rounded-lg text-sm ${
                testResult.success ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {testResult.success
                  ? `Connected! Found ${testResult.tables} tables.`
                  : `Error: ${testResult.error}`}
              </div>
            )}

            <button
              onClick={testConnection}
              disabled={!databaseUrl || testing}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium transition"
            >
              {testing ? "Testing..." : "Test connection"}
            </button>
          </div>
        )}

        {/* Step 2: API Key */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">Anthropic API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-xs text-white/30 mt-2">
                Get your key at console.anthropic.com
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!apiKey}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium transition"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Password */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">Admin password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-xs text-white/30 mt-2">
                Password for web login. Default: admin
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition text-sm">
                Back
              </button>
              <button
                onClick={save}
                disabled={!password || saving}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-medium transition"
              >
                {saving ? "Saving..." : "Launch text2SQL"}
              </button>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-center text-xs text-white/20 space-y-1">
          <p>Your credentials are stored locally and never leave this server.</p>
        </div>
      </div>
    </div>
  );
}
