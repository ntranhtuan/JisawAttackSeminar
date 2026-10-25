import TokenBarChart from "./TokenBarChart.jsx";

export default function VolumeChart({ rows, highlight }) {
  return <TokenBarChart rows={rows} dataKey="volume" label="Volume (số email trả về)" highlight={highlight} />;
}
