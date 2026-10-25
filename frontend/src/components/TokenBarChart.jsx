import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useThemeColors from "./useThemeColors.js";

/** Biểu đồ cột ngang top-N token theo một chỉ số (dùng chung cho Volume/Frequency). */
export default function TokenBarChart({ rows, dataKey, label, highlight, limit = 12 }) {
  const c = useThemeColors();
  const data = [...(rows ?? [])].sort((a, b) => b[dataKey] - a[dataKey]).slice(0, limit);
  if (!data.length) return <div className="empty">Chưa có truy vấn nào.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 24 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={c.grid} />
        <XAxis type="number" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="token"
          width={84}
          tick={{ fill: c.text, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.4 }}
          contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [Number(v).toLocaleString("en-US"), label]}
        />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} barSize={14}>
          {data.map((d) => (
            <Cell key={d.token} fill={d.token === highlight ? c.attacker : c.server} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
