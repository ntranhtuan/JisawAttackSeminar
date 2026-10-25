async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body = {}) => request("POST", path, body),
};

export const pct = (x, digits = 1) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
export const num = (x) => (x == null ? "—" : Number(x).toLocaleString("en-US"));
export const sci = (x) => (x == null ? "—" : x < 0.001 ? x.toExponential(2) : x.toFixed(4));
