import { useEffect, useState } from "react";
import { api, num, pct, sci } from "../api.js";
import LeakageTable from "../components/LeakageTable.jsx";
import PredictionTable from "../components/PredictionTable.jsx";
import AccuracyChart from "../components/AccuracyChart.jsx";
import RoleStrip from "../components/RoleStrip.jsx";

const STEPS = [
  { id: "stream", label: "Generate query stream", short: "Sinh truy vấn" },
  { id: "leakage", label: "Build SSE leakage", short: "Thu leakage" },
  { id: "s1", label: "Select distinctive queries", short: "Module 1 · RecoverDQ" },
  { id: "s2", label: "Verify with co-occurrence", short: "Module 2 · Verify" },
  { id: "s3", label: "Recover remaining queries", short: "Module 3 · RecoverAll" },
  { id: "acc", label: "Show accuracy", short: "Kết quả & Reveal" },
  { id: "cm", label: "Countermeasure", short: "Padding / Obfuscation" },
];

const CM = [
  { id: "none", label: "None" },
  { id: "padding", label: "Padding" },
  { id: "obfuscation", label: "Obfuscation" },
];

const PARAM_META = [
  { key: "alpha", label: "α", min: 0, max: 1, step: 0.05 },
  { key: "beta", label: "β", min: 0, max: 1, step: 0.05 },
  { key: "BaseRec", label: "BaseRec", min: 5, max: 200, step: 1 },
  { key: "ConfRec", label: "ConfRec", min: 2, max: 150, step: 1 },
  { key: "RefSpeed", label: "RefSpeed", min: 1, max: 100, step: 1 },
];

const knowledgeCols = [
  { key: "keyword", label: "Keyword", render: (r) => <span className="mono">{r.keyword}</span> },
  { key: "volume", label: "Volume", align: "right", render: (r) => sci(r.volume) },
  { key: "frequency", label: "Frequency", align: "right", render: (r) => sci(r.frequency) },
];
const observedCols = [
  { key: "token", label: "Token", render: (r) => <span className="mono">{r.token}</span> },
  { key: "volume", label: "Volume", align: "right", render: (r) => sci(r.volume) },
  { key: "frequency", label: "Frequency", align: "right", render: (r) => sci(r.frequency) },
];
const step1Cols = [
  { key: "token", label: "Token", render: (r) => <span className="mono">{r.token}</span> },
  { key: "candidate_keyword", label: "Candidate", render: (r) => <span className="mono strong">{r.candidate_keyword}</span> },
  { key: "d", label: "d (độ nổi bật)", align: "right", render: (r) => sci(r.d) },
  { key: "v", label: "Volume obs / ext", align: "right", render: (r) => `${sci(r.observed_volume)} / ${sci(r.external_volume)}` },
  { key: "f", label: "Freq obs / ext", align: "right", render: (r) => `${sci(r.observed_frequency)} / ${sci(r.external_frequency)}` },
];
const anchorCols = [
  { key: "token", label: "Token", render: (r) => <span className="mono">{r.token}</span> },
  { key: "candidate_keyword", label: "Keyword", render: (r) => <span className="mono strong">{r.candidate_keyword}</span> },
  { key: "revconf", label: "revconf", align: "right", render: (r) => r.revconf.toFixed(4) },
];

function Takeaway({ children }) {
  return <div className="takeaway">➜ {children}</div>;
}

export default function AttackerPage({ status, onChange, onGoto }) {
  const [params, setParams] = useState(status?.default_params ?? { alpha: 0.5, beta: 0.7, BaseRec: 50, ConfRec: 20, RefSpeed: 10 });
  const [done, setDone] = useState({});
  const [sel, setSel] = useState("stream");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState(null);
  const [lookup, setLookup] = useState("meeting");
  const [results, setResults] = useState({});
  const [preds, setPreds] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [spotToken, setSpotToken] = useState(null);
  const [round, setRound] = useState(1);
  const [cmMethod, setCmMethod] = useState("padding");
  const [cmResults, setCmResults] = useState({});

  const loadView = async (kw = lookup) => {
    try {
      setView(await api.get(`/attacker/view?limit=60&keyword=${encodeURIComponent(kw)}`));
    } catch (e) {
      setError(e.message);
    }
  };
  const loadPreds = async () => setPreds(await api.get("/jigsaw/predictions?limit=2000"));

  // Token client vừa tìm (attacker nghe lén server nên cũng thấy token này).
  useEffect(() => {
    api.get("/server/view?limit=1&heatmap_size=1").then((v) => setSpotToken(v.last_client_query?.token ?? null)).catch(() => {});
  }, [status?.total_queries_logged]);

  useEffect(() => {
    loadView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order = STEPS.map((s) => s.id);
  const nextStep = STEPS.find((s) => !done[s.id])?.id;
  const canRun = (id) => order.indexOf(id) <= order.indexOf(nextStep ?? "cm");

  const clearAfter = (id) => {
    const idx = order.indexOf(id);
    setDone((d) => Object.fromEntries(Object.entries(d).filter(([k]) => order.indexOf(k) < idx)));
    setResults((r) => Object.fromEntries(Object.entries(r).filter(([k]) => order.indexOf(k) < idx)));
    if (idx <= 2) {
      setPreds(null);
      setRevealed(false);
    }
    setCmResults({});
  };

  const runStep = async (id) => {
    setBusy(id);
    setError("");
    setSel(id);
    try {
      if (id === "cm") {
        const r = await api.post("/countermeasure/run", { ...params, method: cmMethod });
        setCmResults((x) => ({ ...x, none: r.before, [r.method]: { ...r.after, message: r.message } }));
        setDone((d) => ({ ...d, cm: true }));
        return true;
      }
      clearAfter(id);
      let r;
      if (id === "stream") r = await api.post("/attacker/generate_stream", {});
      if (id === "leakage") r = await api.post("/attacker/build_leakage");
      if (id === "s1") r = await api.post("/jigsaw/step/1", params);
      if (id === "s2") r = await api.post("/jigsaw/step/2", params);
      if (id === "s3") r = await api.post("/jigsaw/step/3", params);
      if (id === "acc") r = await api.get("/jigsaw/accuracy");
      setResults((x) => ({ ...x, [id]: r }));
      setDone((d) => ({ ...d, [id]: true }));
      if (id === "stream" || id === "leakage") await loadView();
      if (["s1", "s2", "s3"].includes(id)) await loadPreds();
      if (id === "s3") setRound(1);
      onChange();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  const runAll = async () => {
    for (const id of order.slice(0, 6)) {
      if (id === "stream" && done.stream) continue;
      if (!(await runStep(id))) break;
    }
  };

  const goNext = () => {
    const nxt = order[order.indexOf(sel) + 1];
    if (!nxt) return;
    if (done[nxt] || nxt === "cm") setSel(nxt);
    else runStep(nxt);
  };
  const goPrev = () => {
    const prv = order[order.indexOf(sel) - 1];
    if (prv) setSel(prv);
  };

  const reveal = async () => {
    await api.post("/jigsaw/reveal");
    setRevealed(true);
    await loadPreds();
  };

  const spot = preds?.predictions?.find((p) => p.token === spotToken);
  const { stream, leakage, s1, s2, s3, acc } = results;
  const curRound = s3?.rounds?.[round - 1] ?? [];
  const selMeta = STEPS.find((s) => s.id === sel);
  const selIdx = order.indexOf(sel);

  // ---------- Nội dung từng bước ----------
  const panels = {
    stream: {
      intro: "Mô phỏng nhân viên công ty tìm kiếm trong 50 tuần. Tần suất mỗi từ khóa lấy theo query trend thật của Enron. Mọi truy vấn đi qua đúng luồng Client → token → Server.",
      body: stream && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="stat-v">{num(stream.generated_queries)}</span>
              <span className="stat-l">truy vấn mô phỏng ({stream.weeks} tuần)</span>
            </div>
            <div className="stat">
              <span className="stat-v">{num(stream.total_queries_logged)}</span>
              <span className="stat-l">truy vấn server đã ghi log</span>
            </div>
            <div className="stat">
              <span className="stat-v">{num(stream.distinct_tokens_observed)}</span>
              <span className="stat-l">token khác nhau</span>
            </div>
          </div>
          <Takeaway>
            Mỗi token để lại dấu vết volume, frequency và access pattern trên server.{" "}
            <button className="linklike" onClick={() => onGoto("server")}>
              Xem tab SSE Server →
            </button>
          </Takeaway>
        </>
      ),
    },
    leakage: {
      intro: "Attacker lấy snapshot leakage từ server và đặt cạnh kiến thức nền (nửa Enron còn lại + query trend công khai). Hai bảng cùng thang chuẩn hoá.",
      body: leakage && (
        <>
          <div className="grid-2 tight">
            <div>
              <h4>External knowledge · {num(view?.external_keyword_count)} keyword</h4>
              <form
                className="lookup"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadView(lookup);
                }}
              >
                <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Tra keyword, vd. meeting" />
                <button className="btn ghost small">Tra cứu</button>
              </form>
              {view?.lookup && (
                <dl className="kv compact">
                  <dt>External keyword</dt>
                  <dd className="mono strong">
                    {view.lookup.keyword}
                    {view.lookup.keyword !== view.lookup.query && <span className="muted"> (stem của “{view.lookup.query}”)</span>}
                  </dd>
                  <dt>Volume · Frequency</dt>
                  <dd className="num">
                    {sci(view.lookup.volume)} · {sci(view.lookup.frequency)}
                  </dd>
                </dl>
              )}
              <LeakageTable rows={view?.external_knowledge} columns={knowledgeCols} highlight={view?.lookup?.keyword} highlightKey="keyword" pageSize={8} />
            </div>
            <div>
              <h4>Observed leakage · {num(view?.observed_token_count)} token</h4>
              <LeakageTable rows={view?.observed_leakage} columns={observedCols} highlight={spotToken} pageSize={8} />
            </div>
          </div>
          <Takeaway>
            Attacker có {num(leakage.distinct_tokens)} mảnh (token) và {num(leakage.external_keywords)} vị trí (keyword). Nhiệm vụ:
            ghép mảnh vào vị trí, không cần khóa.
          </Takeaway>
        </>
      ),
    },
    s1: {
      intro: "Token có volume/frequency khác biệt hẳn mọi token khác thì dễ ghép đúng nhất: ghép mảnh dễ trước.",
      formula: `d(td_i) = min_{j≠i}  α·|V(td_i) − V(td_j)| + (1−α)·|F(td_i) − F(td_j)|
→ sắp xếp d giảm dần, lấy BaseRec token nổi bật nhất
→ ghép mỗi token với keyword có (V, F) gần nhất`,
      body: s1 && (
        <>
          <LeakageTable rows={s1.selected} columns={step1Cols} pageSize={10} />
          <Takeaway>Đã chọn {s1.BaseRec} token nổi bật nhất và gán candidate keyword cho từng token. Một số cặp có thể sai, nên cần kiểm tra lại ở bước sau.</Takeaway>
        </>
      ),
    },
    s2: {
      intro: "Nếu ghép đúng, “hàng xóm” của token (các token hay xuất hiện cùng) phải giống “hàng xóm” của keyword.",
      formula: `revconf_i = ‖ norm_row(M_obs[td_i]) − norm_row(M_ext[kw_i]) ‖₂
→ loại các cặp revconf cao nhất, giữ ConfRec mỏ neo tin cậy`,
      body: s2 && (
        <>
          <div className="grid-2 tight">
            <div>
              <h4>Verified anchors ({s2.anchors.length})</h4>
              <LeakageTable rows={s2.anchors} columns={anchorCols} pageSize={8} />
            </div>
            <div>
              <h4>Bị loại ({s2.rejected.length})</h4>
              <LeakageTable rows={s2.rejected} columns={anchorCols} pageSize={8} />
            </div>
          </div>
          <Takeaway>Giữ {s2.anchors.length} mỏ neo có co-occurrence khớp nhất làm điểm tựa cho bước khôi phục toàn bộ.</Takeaway>
        </>
      ),
    },
    s3: {
      intro: "Mỗi vòng chỉ nhận những cặp chắc chắn nhất, rồi dùng chúng làm mỏ neo cho vòng sau, cho đến khi mọi token đều có prediction.",
      formula: `score(td, w)  = −ln( β·dist_cooc(td, w) + (1−β)·dist_stat(td, w) )
certainty(td) = score(td, best_w) − score(td, second_best_w)
→ mỗi vòng nhận tối đa RefSpeed cặp certainty cao nhất`,
      body: s3 && (
        <>
          <div className="round-nav">
            <button className="btn ghost small" disabled={round <= 1} onClick={() => setRound((r) => r - 1)}>
              ←
            </button>
            <input type="range" min={1} max={s3.total_rounds} value={round} onChange={(e) => setRound(Number(e.target.value))} />
            <button className="btn ghost small" disabled={round >= s3.total_rounds} onClick={() => setRound((r) => r + 1)}>
              →
            </button>
            <span className="mono">
              Round {round} / {s3.total_rounds}
            </span>
          </div>
          <div className="round-pairs">
            {curRound.map((p) => (
              <div key={p.token} className="pair">
                <span className="mono">{p.token}</span>
                <span className="muted">→</span>
                <span className="mono strong">{p.predicted_keyword}</span>
                <span className="muted num">c={p.certainty.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <Takeaway>
            Sau {s3.total_rounds} vòng, toàn bộ {num(preds?.total)} token đã có <b>prediction</b>. Attacker vẫn chưa biết dự đoán nào đúng.
          </Takeaway>
        </>
      ),
    },
    acc: {
      intro: "Evaluator dùng oracle của client (biết khóa) để chấm điểm sau khi Jigsaw đã đưa ra prediction. Attacker không dùng thông tin này.",
      body: acc && (
        <>
          <div className="grid-2 tight">
            <div>
              <div className="big-metric">
                <span className="big-v">{pct(acc.accuracy)}</span>
                <span className="muted">
                  {num(acc.correct_predictions)} / {num(acc.total_queries)} truy vấn được khôi phục đúng (tính theo tần suất)
                </span>
              </div>
              <ul className="metric-list">
                <li>
                  Theo token khác nhau: <b>{pct(acc.final?.distinct)}</b> ({num(acc.distinct_tokens)} token)
                </li>
                <li>
                  Module 1: <b>{pct(acc.step1?.weighted)}</b> → Module 2: <b>{pct(acc.step2?.weighted)}</b> → Final: <b>{pct(acc.final?.weighted)}</b>
                </li>
              </ul>
            </div>
            <AccuracyChart
              height={200}
              data={[
                acc.step1 && { name: "M1 candidates", value: acc.step1.weighted, tone: "muted" },
                acc.step2 && { name: "M2 anchors", value: acc.step2.weighted, tone: "server" },
                acc.final && { name: "Final (M3)", value: acc.final.weighted, tone: "attacker" },
              ].filter(Boolean)}
            />
          </div>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0 }}>
              Prediction table <span className="pill attacker">prediction</span>
            </h4>
            <button className="btn attacker" disabled={revealed} onClick={reveal}>
              {revealed ? "Ground truth revealed" : "Reveal ground truth"}
            </button>
          </div>
          <PredictionTable predictions={preds?.predictions} revealed={revealed} />
        </>
      ),
    },
    cm: {
      intro: "Triển khai lại SSE với biện pháp phòng thủ (áp lên access pattern server quan sát), rồi chạy lại Jigsaw với cùng tham số.",
      body: (
        <>
          <div className="cm-row">
            <div className="seg">
              {CM.map((m) => (
                <button key={m.id} className={cmMethod === m.id ? "on" : ""} onClick={() => setCmMethod(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            <button className="btn attacker" disabled={!done.leakage || !!busy} onClick={() => runStep("cm")}>
              {busy === "cm" ? "Đang chạy lại Jigsaw…" : "Run Jigsaw again"}
            </button>
          </div>
          {!done.leakage && <div className="empty">Cần hoàn thành bước “Build SSE leakage” trước.</div>}
          {cmResults.none && (
            <div className="grid-2 tight">
              <div>
                {Object.entries(cmResults)
                  .filter(([k]) => k !== "none")
                  .map(([k, r]) => (
                    <div key={k} className="cm-result">
                      <div className="cm-line">
                        Accuracy before {k}: <b>{pct(cmResults.none.accuracy)}</b>
                      </div>
                      <div className="cm-line">
                        Accuracy after {k}: <b className="attacker-text">{pct(r.accuracy)}</b>
                      </div>
                      <div className="muted">
                        Chi phí: băng thông ×{r.communication_overhead.toFixed(2)}, lưu trữ ×{r.storage_overhead.toFixed(2)}
                      </div>
                      <Takeaway>{r.message}</Takeaway>
                    </div>
                  ))}
              </div>
              <AccuracyChart
                height={200}
                data={CM.filter((m) => cmResults[m.id]).map((m) => ({
                  name: m.label,
                  value: cmResults[m.id].accuracy,
                  tone: m.id === "none" ? "attacker" : "client",
                }))}
              />
            </div>
          )}
        </>
      ),
    },
  };

  const panel = panels[sel];
  const selDone = sel === "cm" ? true : done[sel];

  return (
    <div className="page">
      <RoleStrip
        role="attacker"
        title="Attacker / Jigsaw"
        has={["Leakage: token, volume, frequency, access pattern", "External knowledge"]}
        hasNot={["Khóa", "Plaintext tài liệu", "Mapping token → keyword"]}
      />

      <div className="wizard">
        <aside className="wizard-side">
          <div className="card side-card">
            <ol className="vstepper">
              {STEPS.map((s, i) => {
                const state = done[s.id] ? "done" : s.id === nextStep ? "current" : "locked";
                return (
                  <li key={s.id}>
                    <button
                      className={`vstep ${state} ${sel === s.id ? "sel" : ""}`}
                      disabled={!!busy || (!done[s.id] && !canRun(s.id))}
                      onClick={() => setSel(s.id)}
                    >
                      <span className="step-n">{done[s.id] ? "✓" : i + 1}</span>
                      <span className="step-text">
                        <span className="step-label">{busy === s.id ? "Đang chạy…" : s.label}</span>
                        <span className="step-desc">{s.short}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <button className="btn ghost small full" disabled={!!busy} onClick={runAll}>
              ▶▶ Chạy tất cả (bước 1–6)
            </button>
          </div>

          <div className="card side-card">
            <h4 className="side-title">Spotlight · token client vừa tìm</h4>
            {spotToken ? (
              <div className="spot">
                <span className="mono token">{spotToken}</span>
                <span className="muted">→</span>
                {spot ? <span className="mono strong">{spot.predicted_keyword}</span> : <span className="muted">chưa dự đoán</span>}
                {spot && revealed && (
                  <div className={spot.correct ? "ok" : "bad"}>
                    Ground truth: <span className="mono">{spot.true_keyword}</span> {spot.correct ? "✓" : "✗"}
                  </div>
                )}
              </div>
            ) : (
              <p className="muted small-text">Chưa có truy vấn từ tab Client.</p>
            )}
          </div>

          <details className="card side-card">
            <summary>⚙ Tham số Jigsaw</summary>
            <div className="params">
              {PARAM_META.map((m) => (
                <label key={m.key} className="param">
                  <span>{m.label}</span>
                  <input
                    type="number"
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    value={params[m.key]}
                    onChange={(e) => setParams((p) => ({ ...p, [m.key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <p className="muted small-text">Đổi tham số rồi chạy lại từ Module 1.</p>
          </details>
        </aside>

        <section className="card wizard-main">
          <div className="panel-head">
            <span className="module-n">{selIdx + 1}</span>
            <div>
              <h3>{selMeta.label}</h3>
              <p className="muted">{panel.intro}</p>
            </div>
          </div>
          {panel.formula && <pre className="formula">{panel.formula}</pre>}
          {error && <div className="alert error">{error}</div>}

          {selDone ? (
            panel.body
          ) : (
            <div className="run-cta">
              <button className="btn attacker big" disabled={!!busy || !canRun(sel)} onClick={() => runStep(sel)}>
                {busy === sel ? "Đang chạy…" : `▶ ${selMeta.label}`}
              </button>
              {!canRun(sel) && <p className="muted">Hoàn thành các bước trước đó.</p>}
            </div>
          )}

          <div className="panel-nav">
            <button className="btn ghost" disabled={selIdx === 0 || !!busy} onClick={goPrev}>
              ← Bước trước
            </button>
            {selIdx < order.length - 1 && (
              <button className="btn attacker" disabled={!!busy || !selDone} onClick={goNext}>
                {done[order[selIdx + 1]] || order[selIdx + 1] === "cm" ? "Bước tiếp →" : `▶ ${STEPS[selIdx + 1].label}`}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
