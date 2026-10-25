import { num } from "../api.js";

export default function ResultList({ result }) {
  if (!result) return null;
  const kw = result.normalized_keyword;
  return (
    <div className="results">
      <div className="results-head">
        <h3>Kết quả ({num(result.result_count)} email khớp)</h3>
        <span className="muted">Hiển thị {result.documents.length} email đầu tiên, đã được client giải mã bằng khóa riêng</span>
      </div>
      <ul className="email-list">
        {result.documents.map((d) => (
          <li key={d.doc_id} className="email">
            <div className="email-id mono">{d.doc_id}</div>
            <div className="email-body">
              {d.plaintext.split(" ").map((w, i) => (
                <span key={i} className={w === kw ? "hit" : ""}>
                  {w}{" "}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="footnote">
        Dataset Enron trong repo đã được tiền xử lý thành <b>túi từ khóa đã stem</b> cho mỗi email (vd. “meeting” →
        “meet”). Đây chính là nội dung plaintext mà client mã hoá trước khi tải lên server.
      </p>
    </div>
  );
}
