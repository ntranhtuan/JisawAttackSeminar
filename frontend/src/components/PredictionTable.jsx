import { useMemo, useState } from "react";
import { num, pct } from "../api.js";

const STAGE_LABEL = { candidate: "Module 1", anchor: "Anchor (M2)", recover_all: "RecoverAll (M3)" };

export default function PredictionTable({ predictions, revealed }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(15);

  const rows = useMemo(() => {
    let r = predictions ?? [];
    if (filter !== "all") r = r.filter((p) => p.stage === filter);
    if (revealed && filter === "wrong") r = (predictions ?? []).filter((p) => !p.correct);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((p) => p.token.includes(q) || p.predicted_keyword.includes(q) || p.true_keyword?.includes(q));
    return r;
  }, [predictions, filter, query, revealed]);

  if (!predictions?.length) return <div className="empty">Chưa có prediction.</div>;

  return (
    <div>
      <div className="table-tools">
        <div className="seg">
          {["all", "anchor", "recover_all", ...(revealed ? ["wrong"] : [])].map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "Tất cả" : f === "wrong" ? "Đoán sai" : STAGE_LABEL[f]}
            </button>
          ))}
        </div>
        <input className="filter" placeholder="Lọc token / keyword…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Encrypted token</th>
              <th />
              <th>Predicted keyword</th>
              <th>Stage</th>
              <th className="right">Freq</th>
              <th className="right">Confidence</th>
              {revealed && <th>Ground truth</th>}
              {revealed && <th>Correct</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((p) => (
              <tr key={p.token}>
                <td className="mono">{p.token}</td>
                <td className="muted">→</td>
                <td className="mono strong">{p.predicted_keyword}</td>
                <td>
                  <span className={`stage ${p.stage}`}>
                    {STAGE_LABEL[p.stage]}
                    {p.round ? ` · r${p.round}` : ""}
                  </span>
                </td>
                <td className="right num">{num(p.observed_frequency)}</td>
                <td className="right">
                  <span className="conf">
                    <span className="conf-bar" style={{ width: `${Math.round(p.confidence * 100)}%` }} />
                    <span className="num">{pct(p.confidence, 0)}</span>
                  </span>
                </td>
                {revealed && <td className="mono">{p.true_keyword}</td>}
                {revealed && <td>{p.correct ? <span className="ok">✓ Yes</span> : <span className="bad">✗ No</span>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > shown && (
          <button className="btn ghost small more" onClick={() => setShown((s) => s + 30)}>
            Xem thêm ({rows.length - shown} dòng)
          </button>
        )}
      </div>
      <p className="footnote">
        Mọi kết quả ở đây là <b>prediction</b> (dự đoán ánh xạ token → keyword), không phải giải mã. Confidence: anchor = 1 −
        revconf/√2; RecoverAll = 1 − e<sup>−certainty</sup>.
      </p>
    </div>
  );
}
