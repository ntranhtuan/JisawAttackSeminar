"""Adapter đọc dataset/enron_db.pkl (không sửa file gốc).

Cấu trúc thực tế của pickle (đã inspect) khác giả định trong JigsawAttack_demo.md:
    pickle.load(f) -> (document_list, keyword_dict)
    document_list: list[list[str]]  -- mỗi email là một túi từ khóa đã stem (vd. "meet", "energi")
    keyword_dict[kw] = {"count": int, "trend": np.ndarray(260,)}  -- trend = tần suất truy vấn theo tuần
Adapter này đổi tên về khái niệm trong tài liệu: count -> total_count, trend -> query_trend.
"""
import pickle

import numpy as np

from config import DATASET_PATH

_RAW_CACHE = None


def _load_raw():
    global _RAW_CACHE
    if _RAW_CACHE is None:
        with open(DATASET_PATH, "rb") as f:
            _RAW_CACHE = pickle.load(f)
    return _RAW_CACHE


class EnronDataset:
    """Chia Enron thành 2 nửa như extract_info.get_all_for_attacks:
    - real_docs: kho email thật của công ty (được mã hoá và đưa lên SSE server)
    - sim_docs: dữ liệu tương tự mà attacker có được (external knowledge)
    """

    def __init__(self, keyword_universe_size, seed):
        document_list, keyword_dict = _load_raw()
        rng = np.random.default_rng(seed)
        perm = rng.permutation(len(document_list))
        half = len(document_list) // 2
        self.real_docs = [document_list[i] for i in perm[half:]]
        self.sim_docs = [document_list[i] for i in perm[:half]]

        ranked = sorted(keyword_dict.items(), key=lambda kv: kv[1]["count"], reverse=True)
        self.universe = [kw for kw, _ in ranked[:keyword_universe_size]]
        self.universe_set = set(self.universe)
        self.keyword_dict = {
            kw: {"total_count": keyword_dict[kw]["count"], "query_trend": keyword_dict[kw]["trend"]}
            for kw in self.universe
        }

    def weekly_frequency(self, week_start, week_end):
        """Phân phối tần suất truy vấn (chuẩn hoá tổng = 1) của universe trong khoảng tuần."""
        f = np.array([np.sum(self.keyword_dict[kw]["query_trend"][week_start:week_end]) for kw in self.universe])
        return f / f.sum()

    def normalize_query(self, query):
        """Client-side keyword extraction: đưa từ người dùng gõ về dạng stem có trong index.
        Ví dụ: "meeting" -> "meet", "energy" -> "energi" (nếu có trong universe)."""
        q = query.strip().lower()
        if q in self.universe_set:
            return q
        candidates = []
        for suffix, repl in [("ings", ""), ("ing", ""), ("ies", "i"), ("ied", "i"), ("ed", ""), ("es", ""),
                             ("s", ""), ("y", "i"), ("ment", ""), ("ation", "ate"), ("ly", "")]:
            if q.endswith(suffix) and len(q) - len(suffix) >= 2:
                stem = q[: len(q) - len(suffix)] + repl
                candidates.append(stem)
                if len(stem) > 2 and stem[-1] == stem[-2]:
                    candidates.append(stem[:-1])  # "planning" -> "plann" -> "plan"
                candidates.append(stem + "e")  # "making" -> "make"
        for c in candidates:
            if c in self.universe_set:
                return c
        return None
