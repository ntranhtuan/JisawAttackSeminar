"""Góc nhìn của attacker: leakage quan sát từ server + external knowledge (nửa Enron còn lại).

Attacker KHÔNG có: khóa, plaintext tài liệu thật, mapping token -> keyword.
"""
import numpy as np


class ExternalKnowledge:
    """Từ điển từ khóa + volume / frequency / co-occurrence ước lượng từ dữ liệu tương tự."""

    def __init__(self, dataset, observe_weeks):
        self.keywords = list(dataset.universe)
        kw_id = {kw: i for i, kw in enumerate(self.keywords)}
        self.sim_kw_d = np.zeros((len(self.keywords), len(dataset.sim_docs)), dtype=np.float32)
        for j, doc in enumerate(dataset.sim_docs):
            for kw in doc:
                i = kw_id.get(kw)
                if i is not None:
                    self.sim_kw_d[i, j] = 1.0
        # Tần suất truy vấn công khai (vd. Google Trends) ở giai đoạn TRƯỚC khi quan sát.
        self.sim_F = dataset.weekly_frequency(0, observe_weeks)
        self.sim_V = self.sim_kw_d.sum(axis=1) / self.sim_kw_d.shape[1]

    def table(self, limit):
        order = np.argsort(-self.sim_F)[:limit]
        return [
            {"keyword": self.keywords[i], "volume": float(self.sim_V[i]), "frequency": float(self.sim_F[i])}
            for i in order
        ]


class ObservedLeakage:
    """Snapshot leakage lấy từ SSE server: token, access pattern, volume, frequency."""

    def __init__(self, server):
        self.tokens, self.real_query_d, self.counts = server.access_matrix()
        self.num_queries = int(self.counts.sum())
        self.real_F = self.counts / self.counts.sum()
        self.volume_count = self.real_query_d.sum(axis=1)
        self.real_V = self.volume_count / self.real_query_d.shape[1]
