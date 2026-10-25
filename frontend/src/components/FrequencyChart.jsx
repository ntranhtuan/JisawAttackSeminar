import TokenBarChart from "./TokenBarChart.jsx";

export default function FrequencyChart({ rows, highlight }) {
  return <TokenBarChart rows={rows} dataKey="frequency" label="Frequency (số lần được truy vấn)" highlight={highlight} />;
}
