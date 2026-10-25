"""Áp dụng countermeasure lên leakage mà server quan sát, tái sử dụng countermeasure.py của repo.

- padding     -> countermeasure.padding_linear_2 (CGPR padding với tài liệu giả), kèm bước attacker
                 thích nghi giống run_single_attack.py (pad cả dữ liệu tương tự).
- obfuscation -> cùng ngữ nghĩa với countermeasure.obfuscate (giữ 1 với xác suất p, bật 0 thành 1 với
                 xác suất q, nhân bản m lần) nhưng vector hoá bằng numpy vì bản gốc lặp Python từng ô
                 (quá chậm cho demo trực tiếp). Attacker thích nghi bên trong attack.Attacker
                 (countermeasure_params["alg"] == "obfuscation").
"""
import numpy as np

import config  # noqa: F401  (thêm REPO_ROOT vào sys.path)
from countermeasure import padding_linear_2


def obfuscate_vectorized(real_query_d, p, q, m, rng):
    tiled = np.tile(real_query_d, (1, m))
    r = rng.random(tiled.shape, dtype=np.float32)
    return np.where(tiled == 1, r <= p, r < q).astype(np.float32)


def apply_countermeasure(params, real_query_d, sim_kw_d, rng):
    alg = params.get("alg")
    real_doc_num = real_query_d.shape[1]
    if alg == "padding_linear_2":
        np.random.seed(int(rng.integers(1 << 31)))
        padded = padding_linear_2(real_query_d, params["n"]).astype(np.float32)
        sim_n = int(params["n"] * sim_kw_d.shape[1] / real_doc_num)
        sim_padded = padding_linear_2(sim_kw_d, sim_n).astype(np.float32)
        return padded, sim_padded
    if alg == "obfuscation":
        return obfuscate_vectorized(real_query_d, params["p"], params["q"], params["m"], rng), sim_kw_d
    return real_query_d, sim_kw_d


def overhead(before, after, freq):
    """Chi phí truyền thông = tổng (volume x số lần truy vấn) sau / trước countermeasure."""
    b = float(np.sum(before.sum(axis=1) * freq))
    a = float(np.sum(after.sum(axis=1) * freq))
    return {
        "communication_overhead": a / b if b else 1.0,
        "storage_overhead": after.shape[1] / before.shape[1],
    }
