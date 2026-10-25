import { useCallback, useEffect, useState } from "react";
import { api, num } from "../api.js";
import LeakageTable from "../components/LeakageTable.jsx";
import VolumeChart from "../components/VolumeChart.jsx";
import FrequencyChart from "../components/FrequencyChart.jsx";
import CooccurrenceHeatmap from "../components/CooccurrenceHeatmap.jsx";
import RoleStrip from "../components/RoleStrip.jsx";

const tokenCols = [
  { key: "token", label: "Token", render: (r) => <span className="mono">{r.token}</span> },
  { key: "frequency", label: "Frequency", align: "right", render: (r) => num(r.frequency) },
  { key: "volume", label: "Volume", align: "right", render: (r) => num(r.volume) },
  {
    key: "top",
    label: "Top co-occurring tokens",
    render: (r) => <span className="mono muted">{r.top_cooccurring_tokens.join(", ") || "—"}</span>,
  },
];

const logCols = [
  { key: "seq", label: "#", align: "right" },
  { key: "week", label: "Tuần", align: "right", render: (r) => r.week ?? "live" },
  { key: "source", label: "Nguồn", render: (r) => <span className={`pill ${r.source}`}>{r.source}</span> },
  { key: "token", label: "Token", render: (r) => <span className="mono">{r.token}</span> },
  { key: "result_count", label: "Result count", align: "right", render: (r) => num(r.result_count) },
  { key: "ids", label: "Returned doc IDs", render: (r) => <span className="mono muted">{r.returned_doc_ids.join(", ")}…</span> },
];

export default function ServerPage({ active }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/server/view").then(setView).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const last = view?.last_client_query;

  return (
    <div className="page">
      <RoleStrip
        role="server"
        title="SSE Server · honest-but-curious"
        has={["Token", "Volume", "Document IDs", "Frequency", "Co-occurrence"]}
        hasNot={["Plaintext query", "Nội dung email", "Khóa"]}
      />
      <div className="grid-server">
        <section className="card">
          <div className="card-head">
            <h3>Truy vấn client gần nhất</h3>
            <button className="btn ghost small" onClick={load}>
              ↻ Làm mới
            </button>
          </div>
          {error && <div className="alert error">{error}</div>}
          {!last ? (
            <div className="empty">Chưa có truy vấn từ tab Client. Hãy search “meeting” trước.</div>
          ) : (
            <>
              <dl className="kv">
                <dt>Token</dt>
                <dd className="mono token big">{last.token}</dd>
                <dt>Frequency</dt>
                <dd className="num">{num(last.frequency)}</dd>
                <dt>Volume</dt>
                <dd className="num">{num(last.result_count)}</dd>
                <dt>Top co-occurring</dt>
                <dd className="mono">{last.top_cooccurring_tokens.join(", ") || "— (cần thêm truy vấn khác)"}</dd>
              </dl>
              <h4>Tài liệu trả về (server chỉ có ciphertext)</h4>
              <ul className="cipher-list">
                {last.ciphertexts.map((c) => (
                  <li key={c.doc_id}>
                    <span className="mono">{c.doc_id}</span>
                    <span className="mono muted cipher">{c.ciphertext}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="alert warn">
            <b>Server does not know plaintext keywords.</b> Nó chỉ thấy chuỗi như{" "}
            <span className="mono">{last?.token ?? "td_…"}</span> — nhưng thống kê của chuỗi đó là manh mối cho attacker.
          </div>
        </section>

      <div className="stats vertical">
        <div className="stat">
          <span className="stat-v">{num(view?.num_documents)}</span>
          <span className="stat-l">encrypted emails lưu trữ</span>
        </div>
        <div className="stat">
          <span className="stat-v">{num(view?.total_queries)}</span>
          <span className="stat-l">truy vấn đã ghi log</span>
        </div>
        <div className="stat">
          <span className="stat-v">{num(view?.distinct_tokens)}</span>
          <span className="stat-l">token khác nhau</span>
        </div>
      </div>
      </div>

      {view?.total_queries < 50 && (
        <div className="alert info">
          Mới có ít truy vấn. Sang tab <b>Attacker / Jigsaw</b> và bấm <b>Generate query stream</b> để mô phỏng nhiều tuần
          nhân viên tìm kiếm — leakage sẽ dày lên ở đây.
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <h3>Top token theo frequency</h3>
          <p className="muted">Số lần mỗi token được truy vấn.</p>
          <FrequencyChart rows={view?.tokens} highlight={last?.token} />
        </section>
        <section className="card">
          <h3>Top token theo volume</h3>
          <p className="muted">Số email mà token đó trả về.</p>
          <VolumeChart rows={view?.tokens} highlight={last?.token} />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>Heatmap co-occurrence</h3>
          <p className="muted">Hai token cùng trả về nhiều email chung → ô càng đậm. Server tính được từ access pattern.</p>
          <CooccurrenceHeatmap heatmap={view?.heatmap} highlight={last?.token} />
        </section>
        <section className="card">
          <h3>Bảng leakage</h3>
          <LeakageTable rows={view?.tokens} columns={tokenCols} highlight={last?.token} />
        </section>
      </div>

      <section className="card">
        <h3>Leakage log (15 dòng mới nhất)</h3>
        <LeakageTable rows={view?.recent_log} columns={logCols} pageSize={15} />
      </section>
    </div>
  );
}
