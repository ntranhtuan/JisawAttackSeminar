export default function CooccurrenceHeatmap({ heatmap, highlight }) {
  if (!heatmap?.tokens?.length) return <div className="empty">Chưa có truy vấn nào.</div>;
  const { tokens, cells } = heatmap;
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" style={{ gridTemplateColumns: `84px repeat(${tokens.length}, minmax(26px, 1fr))` }}>
        <div />
        {tokens.map((t) => (
          <div key={t} className={`hm-col mono ${t === highlight ? "hl" : ""}`} title={t}>
            {t.slice(3)}
          </div>
        ))}
        {tokens.map((row, i) => (
          <div key={row} style={{ display: "contents" }}>
            <div className={`hm-row mono ${row === highlight ? "hl" : ""}`}>{row}</div>
            {cells[i].map((cell, j) => (
              <div
                key={j}
                className="hm-cell"
                title={`${row} × ${tokens[j]}: ${cell.count.toLocaleString("en-US")} email chung`}
                style={{
                  background: `color-mix(in srgb, var(--server) ${Math.round(Math.min(1, cell.norm) * 100)}%, var(--surface-2))`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hm-legend">
        <span>ít email chung</span>
        <span className="hm-scale" />
        <span>nhiều email chung</span>
      </div>
    </div>
  );
}
