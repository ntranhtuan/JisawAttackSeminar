"""Bọc attack.attack.Attacker (Jigsaw gốc của repo) để chạy từng module và ghi lại trace cho UI.

Module 1 (RecoverDQ) và Module 2 (Verify) gọi thẳng attack_step_1 / attack_step_2 gốc.
Module 3 (RecoverAll) giữ nguyên công thức của attack_step_3 gốc, chỉ tách vòng while thành
từng "round" để hiển thị các cặp được nhận ở mỗi vòng.
"""
import math

import numpy as np

import config  # noqa: F401  (thêm REPO_ROOT vào sys.path)
from attack.attack import Attacker
from cal_acc import calculate_acc_weighted
from countermeasure_adapter import apply_countermeasure


class TracingAttacker(Attacker):
    def attack_step_3_round(self):
        """Một vòng của attack_step_3 gốc. Trả về [(td, kw, certainty)] nhận trong vòng này."""
        paired_td = list(self.tdid_2_kwsid.keys())
        paired_kw = [self.tdid_2_kwsid[i] for i in paired_td]
        unpaired_kw = list(set([i for i in range(len(self.sim_M))]) - set(paired_kw))
        un_td_list = list(self.unrec_td_set)

        M = self.real_M[un_td_list][:, paired_td]
        M_ = self.sim_M[unpaired_kw][:, paired_kw]
        M = M / M.sum(axis=1).reshape((len(M), 1))
        M_ = M_ / M_.sum(axis=1).reshape((len(M_), 1))

        sim_F = self.sim_F[unpaired_kw]
        real_F = self.real_F[un_td_list]
        sim_V = self.sim_V[unpaired_kw]
        real_V = self.real_V[un_td_list]

        Certainty = []
        for i in range(len(M)):
            S = self.alpha * np.abs(real_V[i] - sim_V) + (1 - self.alpha) * (np.abs(real_F[i] - sim_F))
            score = -np.log(self.beta * np.linalg.norm(M[i] - M_, axis=1) + (1 - self.beta) * (S))
            score = sorted(score, reverse=True)
            certainty = score[0] - score[1]
            Certainty.append([i, certainty])
        Certainty.sort(key=lambda x: x[1], reverse=True)
        top = Certainty[: int(self.refinespeed)]

        accepted = []
        tdid_2_kwsid = {}
        for i, certainty in top:
            kw = np.argmax(-np.log(np.linalg.norm(M[i] - M_, axis=1)))
            tdid_2_kwsid[un_td_list[i]] = unpaired_kw[kw]
            accepted.append((un_td_list[i], unpaired_kw[kw], certainty))
        self.tdid_2_kwsid.update(tdid_2_kwsid)
        self.tdid_2_kwsid_step3.update(tdid_2_kwsid)
        self.unrec_td_set = self.unrec_td_set - set(tdid_2_kwsid.keys())
        if self.refinespeed_exp == True:
            self.refinespeed = self.refinespeed * 1.1
        return accepted


def _finite(x, default=0.0):
    x = float(x)
    return x if math.isfinite(x) else default


class JigsawRun:
    """Một lần chạy Jigsaw trên snapshot leakage + external knowledge (có thể kèm countermeasure)."""

    def __init__(self, knowledge, leakage, params, countermeasure_name, countermeasure_params, rng):
        self.knowledge = knowledge
        self.leakage = leakage
        self.countermeasure = countermeasure_name
        n_tokens = len(leakage.tokens)
        base_rec = max(2, min(int(params["BaseRec"]), n_tokens))
        conf_rec = max(1, min(int(params["ConfRec"]), base_rec - 1))
        self.params = {
            "alpha": float(params["alpha"]),
            "beta": float(params["beta"]),
            "BaseRec": base_rec,
            "ConfRec": conf_rec,
            "RefSpeed": max(1, int(params["RefSpeed"])),
        }
        self.real_query_d, sim_kw_d = apply_countermeasure(
            countermeasure_params, leakage.real_query_d, knowledge.sim_kw_d, rng
        )
        self.attacker = TracingAttacker(
            sim_kw_d,
            self.real_query_d,
            knowledge.sim_F,
            leakage.real_F,
            baseRec=base_rec,
            confRec=conf_rec,
            refinespeed=self.params["RefSpeed"],
            alpha=self.params["alpha"],
            beta=self.params["beta"],
            countermeasure_params=countermeasure_params,
        )
        self.stage = 0
        self.step1_trace = []
        self.anchor_trace = {}
        self.rounds = []
        self.meta = {}  # td -> {"stage", "confidence", "round"}

    # ---------------- Module 1 ----------------
    def step1(self):
        a = self.attacker
        d_fv = a.calculate_dVF()
        a.attack_step_1()
        for td in sorted(a.tdid_2_kwsid_step1, key=lambda t: -d_fv[t]):
            kw = a.tdid_2_kwsid_step1[td]
            self.step1_trace.append({
                "token": self.leakage.tokens[td],
                "candidate_keyword": self.knowledge.keywords[kw],
                "d": float(d_fv[td]),
                "observed_volume": float(a.real_V[td]),
                "observed_frequency": float(a.real_F[td]),
                "external_volume": float(a.sim_V[kw]),
                "external_frequency": float(a.sim_F[kw]),
            })
        self.stage = 1
        return {"selected": self.step1_trace, "BaseRec": self.params["BaseRec"]}

    # ---------------- Module 2 ----------------
    def step2(self):
        a = self.attacker
        pairs = list(a.tdid_2_kwsid_step1.items())
        td = [p[0] for p in pairs]
        kw = [p[1] for p in pairs]
        td_M = a.real_M[td][:, td]
        kw_M = a.sim_M[kw][:, kw]
        with np.errstate(divide="ignore", invalid="ignore"):
            td_M = td_M / td_M.sum(axis=1, keepdims=True)
            kw_M = kw_M / kw_M.sum(axis=1, keepdims=True)
            revconf = np.linalg.norm(td_M - kw_M, axis=1)
        a.attack_step_2()
        kept, rejected = [], []
        for (t, k), r in sorted(zip(pairs, revconf), key=lambda x: x[1]):
            row = {
                "token": self.leakage.tokens[t],
                "candidate_keyword": self.knowledge.keywords[k],
                "revconf": _finite(r, 99.0),
            }
            if t in a.tdid_2_kwsid_step2:
                kept.append(row)
                self.meta[t] = {"stage": "anchor", "round": 0,
                                "confidence": max(0.0, 1 - _finite(r, 2.0) / math.sqrt(2))}
            else:
                rejected.append(row)
        self.anchor_trace = {"anchors": kept, "rejected": rejected, "ConfRec": self.params["ConfRec"]}
        self.stage = 2
        return self.anchor_trace

    # ---------------- Module 3 ----------------
    def step3(self, max_rounds_in_trace=None):
        a = self.attacker
        with np.errstate(divide="ignore", invalid="ignore"):
            while len(a.unrec_td_set) > 0:
                accepted = a.attack_step_3_round()
                r = len(self.rounds) + 1
                rows = []
                for t, k, certainty in accepted:
                    c = _finite(certainty)
                    self.meta[t] = {"stage": "recover_all", "round": r, "confidence": 1 - math.exp(-max(c, 0.0))}
                    rows.append({"token": self.leakage.tokens[t], "predicted_keyword": self.knowledge.keywords[k],
                                 "certainty": c})
                self.rounds.append(rows)
                if not accepted:
                    break
        self.stage = 3
        return {"rounds": self.rounds, "total_rounds": len(self.rounds)}

    def run_all(self):
        if self.stage < 1:
            self.step1()
        if self.stage < 2:
            self.step2()
        if self.stage < 3:
            self.step3()

    def predictions(self):
        a = self.attacker
        mapping = a.tdid_2_kwsid if self.stage >= 2 else a.tdid_2_kwsid_step1
        out = []
        for td, kw in mapping.items():
            m = self.meta.get(td, {"stage": "candidate", "round": 0, "confidence": 0.0})
            out.append({
                "token": self.leakage.tokens[td],
                "predicted_keyword": self.knowledge.keywords[kw],
                "stage": m["stage"],
                "round": m["round"],
                "confidence": round(m["confidence"], 4),
                "observed_frequency": int(self.leakage.counts[td]),
                "observed_volume": int(self.real_query_d[td].sum()),
            })
        out.sort(key=lambda p: -p["observed_frequency"])
        return out

    # ---------------- Chấm điểm (cần oracle của client) ----------------
    def evaluate(self, oracle):
        """oracle(token) -> keyword thật. Chỉ gọi sau khi đã có prediction."""
        id_kws = dict(enumerate(self.knowledge.keywords))
        id_query = {i: oracle(t) for i, t in enumerate(self.leakage.tokens)}
        query_frequency = {id_query[i]: int(c) for i, c in enumerate(self.leakage.counts)}
        data = {"id_kws": id_kws, "id_query": id_query, "query_frequency": query_frequency}
        a = self.attacker

        def acc(mapping):
            if not mapping:
                return None
            correct, weighted, _, _ = calculate_acc_weighted(data, mapping)
            distinct = sum(1 for td, kw in mapping.items() if id_query[td] == id_kws[kw]) / len(mapping)
            return {"weighted": weighted, "distinct": distinct, "recovered": len(mapping),
                    "correct_queries": int(correct)}

        result = {
            "step1": acc(a.tdid_2_kwsid_step1),
            "step2": acc(a.tdid_2_kwsid_step2) if self.stage >= 2 else None,
            "final": acc(a.tdid_2_kwsid) if self.stage >= 3 else None,
        }
        main = result["final"] or result["step2"] or result["step1"]
        result.update({
            "accuracy": main["weighted"],
            "total_queries": self.leakage.num_queries,
            "correct_predictions": main["correct_queries"],
            "distinct_tokens": len(self.leakage.tokens),
        })
        return result
