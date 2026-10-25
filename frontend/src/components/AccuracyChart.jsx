import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useThemeColors from "./useThemeColors.js";

/** data: [{name, value (0..1), tone: "attacker" | "client" | "server" | "muted"}] */
export default function AccuracyChart({ data, height = 220 }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="name" tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
          tick={{ fill: c.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.4 }}
          contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [`${(v * 100).toFixed(1)}%`, "Accuracy"]}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((d) => (
            <Cell key={d.name} fill={c[d.tone ?? "attacker"]} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v) => `${(v * 100).toFixed(1)}%`}
            style={{ fill: c.text, fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
