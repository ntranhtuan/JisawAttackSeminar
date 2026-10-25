import { useCallback, useEffect, useState } from "react";
import { api, num } from "./api.js";
import ClientPage from "./pages/ClientPage.jsx";
import ServerPage from "./pages/ServerPage.jsx";
import AttackerPage from "./pages/AttackerPage.jsx";

const TABS = [
  { id: "client", label: "Client", role: "client", hint: "Biết plaintext + khóa" },
  { id: "server", label: "SSE Server", role: "server", hint: "Chỉ thấy token + leakage" },
  { id: "attacker", label: "Attacker / Jigsaw", role: "attacker", hint: "Dự đoán token → keyword" },
];

const PRESET_LABELS = {
  fast: "Fast demo (500 kw)",
  standard: "Standard (1,000 kw)",
  full: "Full experiment (1,000 kw · 25k queries)",
};

export default function App() {
  const [tab, setTab] = useState("client");
  const [status, setStatus] = useState(null);
  const [epoch, setEpoch] = useState(0); // tăng mỗi lần reset để các trang xoá state cục bộ
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(() => {
    api.get("/status").then(setStatus).catch((e) => setError(e.message));
  }, []);

  useEffect(refreshStatus, [refreshStatus]);

  const reset = async (preset) => {
    setBusy(true);
    setError("");
    try {
      setStatus(await api.post("/reset", { preset }));
      setEpoch((e) => e + 1);
      setTab("client");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                d="M4 4h7v3a2 2 0 1 0 4 0V4h5v7h-3a2 2 0 1 0 0 4h3v5h-7v-3a2 2 0 1 0-4 0v3H4v-7h3a2 2 0 1 0 0-4H4z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <h1>Jigsaw Attack against SSE</h1>
            <p>Query Recovery from Easy to Hard — demo trên dataset Enron</p>
          </div>
        </div>
        <div className="topbar-actions">
          <select
            value={status?.preset ?? "fast"}
            disabled={busy}
            onChange={(e) => reset(e.target.value)}
            aria-label="Demo size"
          >
            {Object.keys(PRESET_LABELS).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
          <button className="btn ghost" disabled={busy} onClick={() => reset(status?.preset ?? "fast")}>
            {busy ? "Đang reset…" : "↺ Reset demo"}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${t.role} ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-step">{i + 1}</span>
            <span>
              <span className="tab-label">{t.label}</span>
              <span className="tab-hint">{t.hint}</span>
            </span>
          </button>
        ))}
        {status && (
          <div className="tab-stats">
            <span>{num(status.num_documents)} encrypted emails</span>
            <span>{num(status.keyword_universe_size)} keywords</span>
            <span>{num(status.total_queries_logged)} queries logged</span>
          </div>
        )}
      </nav>

      {error && <div className="alert error">{error} — backend đã chạy chưa? (cổng 8000)</div>}

      <main key={epoch}>
        <div hidden={tab !== "client"}>
          <ClientPage onChange={refreshStatus} onGoto={setTab} />
        </div>
        <div hidden={tab !== "server"}>
          <ServerPage active={tab === "server"} />
        </div>
        <div hidden={tab !== "attacker"}>
          <AttackerPage status={status} onChange={refreshStatus} onGoto={setTab} />
        </div>
      </main>
    </div>
  );
}
