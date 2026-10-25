import { useState } from "react";

/** Bảng dữ liệu gọn. columns: [{key, label, render?, align?}] */
export default function LeakageTable({ rows, columns, highlight, highlightKey = "token", pageSize = 12, empty }) {
  const [shown, setShown] = useState(pageSize);
  if (!rows?.length) return <div className="empty">{empty ?? "Chưa có dữ liệu."}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "right" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((r, i) => (
            <tr key={i} className={highlight && r[highlightKey] === highlight ? "highlight" : ""}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "right num" : ""}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown && (
        <button className="btn ghost small more" onClick={() => setShown((s) => s + pageSize * 2)}>
          Xem thêm ({rows.length - shown} dòng)
        </button>
      )}
    </div>
  );
}
