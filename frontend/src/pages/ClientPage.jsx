import { useState } from "react";
import { api, num } from "../api.js";
import SearchBox from "../components/SearchBox.jsx";
import ResultList from "../components/ResultList.jsx";
import RoleStrip from "../components/RoleStrip.jsx";

export default function ClientPage({ onChange, onGoto }) {
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (query) => {
    setLoading(true);
    setError("");
    try {
      const r = await api.post("/search", { query });
      setResult(r);
      setHistory((h) => [{ q: r.plaintext_query, t: r.encrypted_token, n: r.result_count }, ...h].slice(0, 8));
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <RoleStrip
        role="client"
        title="Client · nhân viên công ty"
        has={["Plaintext query", "Khóa bí mật K", "Nội dung email"]}
        hasNot={["Leakage log của server"]}
      />
      <div className="grid-search">
        <section className="card">
          <h3>Search</h3>
          <SearchBox onSearch={search} loading={loading} />
          {error && <div className="alert error">{error}</div>}
          {history.length > 0 && (
            <div className="history">
              <h4>Lịch sử tìm kiếm của bạn</h4>
              {history.map((h, i) => (
                <div key={i} className="history-row">
                  <span className="mono">{h.q}</span>
                  <span className="muted">→</span>
                  <span className="mono token">{h.t}</span>
                  <span className="muted num">{num(h.n)} email</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {result && (
        <>
          <section className="card">
            <h3>Điều gì vừa xảy ra?</h3>
            <ol className="pipeline">
              <li className="client">
                <span className="pl-label">1 · Client nhập</span>
                <span className="pl-value mono">{result.plaintext_query}</span>
              </li>
              <li className="client">
                <span className="pl-label">2 · Chuẩn hoá (stem)</span>
                <span className="pl-value mono">{result.normalized_keyword}</span>
              </li>
              <li className="client">
                <span className="pl-label">3 · HMAC-SHA256(K, ·)</span>
                <span className="pl-value mono token">{result.encrypted_token}</span>
              </li>
              <li className="server">
                <span className="pl-label">4 · Server tra encrypted index</span>
                <span className="pl-value">{num(result.result_count)} document IDs</span>
              </li>
              <li className="server">
                <span className="pl-label">5 · Server ghi leakage</span>
                <span className="pl-value">token · volume · IDs · thời gian</span>
              </li>
              <li className="client">
                <span className="pl-label">6 · Client giải mã email</span>
                <span className="pl-value">bằng khóa K</span>
              </li>
            </ol>
            <div className="alert warn">
              <b>Server only sees the encrypted token.</b> Server nhận <span className="mono">{result.encrypted_token}</span>,
              không bao giờ nhận “{result.plaintext_query}”. Nhưng nó vẫn biết token này trả về {num(result.result_count)} email
              — đó là <i>leakage</i>.
              <button className="btn server small" onClick={() => onGoto("server")}>
                Xem phía SSE Server →
              </button>
            </div>
          </section>
          <section className="card">
            <ResultList result={result} />
          </section>
        </>
      )}
    </div>
  );
}
