import { useState } from "react";

// Recharts vẽ SVG bằng thuộc tính fill, nên đọc giá trị thật của CSS token rồi truyền vào.
const NAMES = ["client", "server", "attacker", "muted", "grid", "text", "ok", "bad", "surface"];

function read() {
  const s = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, s.getPropertyValue(`--${n}`).trim()]));
}

export default function useThemeColors() {
  const [colors] = useState(read);
  return colors;
}
