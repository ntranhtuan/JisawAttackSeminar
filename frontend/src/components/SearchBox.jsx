import { useEffect, useState } from "react";
import { api } from "../api.js";

const QUICK = ["meeting", "contract", "price", "deal", "power", "market"];

export default function SearchBox({ onSearch, loading }) {
  const [query, setQuery] = useState("meeting");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const p = query.trim().slice(0, 3);
    if (!p) return setSuggestions([]);
    const id = setTimeout(() => {
      api.get(`/client/keywords?prefix=${encodeURIComponent(p)}&limit=15`)
        .then((d) => setSuggestions(d.keywords))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const submit = (e) => {
    e?.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form className="searchbox" onSubmit={submit}>
      <div className="searchbox-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          list="kw-suggestions"
          placeholder="Nhập từ khóa, ví dụ: meeting"
          aria-label="Plaintext query"
        />
        <datalist id="kw-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button className="btn client" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <div className="chips">
        <span className="muted">Thử nhanh:</span>
        {QUICK.map((q) => (
          <button
            type="button"
            key={q}
            className="chip"
            onClick={() => {
              setQuery(q);
              onSearch(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </form>
  );
}
