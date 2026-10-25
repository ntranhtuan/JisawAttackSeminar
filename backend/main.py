"""FastAPI backend cho demo Jigsaw Attack against SSE.

Chạy:  cd backend && .venv/bin/uvicorn main:app --port 8000
Quy tắc phân quyền dữ liệu (mục 12 của JigsawAttack_demo.md):
  /api/search, /api/client/*      -> Client: được thấy plaintext query + plaintext email
  /api/leakage, /api/server/*     -> SSE Server: chỉ token, volume, frequency, access pattern, ciphertext
  /api/attacker/*, /api/jigsaw/*  -> Attacker: leakage + external knowledge; ground truth chỉ sau khi reveal
"""
import threading
import time

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import config
from attacker import ExternalKnowledge, ObservedLeakage
from countermeasure_adapter import overhead
from dataset_loader import EnronDataset
from jigsaw_adapter import JigsawRun
from sse_server import SSEClient, SSEServer, doc_id_str

app = FastAPI(title="Jigsaw SSE Demo")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

COUNTERMEASURE_MESSAGES = {
    "none": "No countermeasure: the server sees the exact volume and access pattern of every query.",
    "padding": "Padding reduces volume leakage but does not eliminate query recovery risk.",
    "obfuscation": "Obfuscation adds random false-positive documents (bandwidth cost). Jigsaw adapts its "
                   "co-occurrence model to the known noise rates, so query recovery risk remains.",
}


class DemoState:
    def __init__(self, preset):
        if preset not in config.PRESETS:
            raise HTTPException(400, f"Unknown preset {preset}")
        self.preset = preset
        self.cfg = dict(config.PRESETS[preset])
        self.rng = np.random.default_rng(config.SEED)
        t0 = time.time()
        self.dataset = EnronDataset(self.cfg["keyword_universe_size"], config.SEED)
        self.server = SSEServer()
        self.client = SSEClient(self.dataset, self.server)
        self.knowledge = None
        self.leakage = None
        self.run = None
        self.revealed = False
        self.stream_weeks = 0
        self.countermeasure_results = {}
        self._cooc_cache = (None, None)
        self.setup_seconds = time.time() - t0

    # Kiến thức nền của attacker được dựng một lần cho mỗi dataset.
    def get_knowledge(self):
        if self.knowledge is None:
            self.knowledge = ExternalKnowledge(self.dataset, self.cfg["observe_weeks"])
        return self.knowledge

    # Ma trận đồng xuất hiện theo access pattern -- server tự tính được từ log.
    def server_cooccurrence(self):
        key = len(self.server.leakage_log)
        if self._cooc_cache[0] != key:
            tokens, mat, freq = self.server.access_matrix()
            cooc = mat @ mat.T if len(tokens) else np.zeros((0, 0), dtype=np.float32)
            self._cooc_cache = (key, (tokens, mat.sum(axis=1), freq, cooc))
        return self._cooc_cache[1]


STATE_LOCK = threading.Lock()
STATE = {"demo": None}


def demo():
    if STATE["demo"] is None:
        STATE["demo"] = DemoState(config.DEFAULT_PRESET)
    return STATE["demo"]


def require_run(d, min_stage):
    if d.run is None or d.run.stage < min_stage:
        raise HTTPException(409, f"Run Jigsaw up to step {min_stage} first.")


# ============================== Schemas ==============================
class ResetRequest(BaseModel):
    preset: str = config.DEFAULT_PRESET


class SearchRequest(BaseModel):
    query: str


class AttackParams(BaseModel):
    alpha: float = Field(config.DEFAULT_ATTACK_PARAMS["alpha"], ge=0, le=1)
    beta: float = Field(config.DEFAULT_ATTACK_PARAMS["beta"], ge=0, le=1)
    BaseRec: int = Field(config.DEFAULT_ATTACK_PARAMS["BaseRec"], ge=2)
    ConfRec: int = Field(config.DEFAULT_ATTACK_PARAMS["ConfRec"], ge=1)
    RefSpeed: int = Field(config.DEFAULT_ATTACK_PARAMS["RefSpeed"], ge=1)


class StepRequest(AttackParams):
    countermeasure: str = "none"


class RunRequest(AttackParams):
    keyword_universe_size: int | None = None
    reveal: bool = False
    countermeasure: str = "none"


class CountermeasureRequest(AttackParams):
    method: str = "padding"


class StreamRequest(BaseModel):
    weeks: int | None = None
    queries_per_week: int | None = None


# ============================== General ==============================
@app.get("/api/status")
def status():
    with STATE_LOCK:
        d = demo()
        return {
            "preset": d.preset,
            "presets": config.PRESETS,
            "config": d.cfg,
            "num_documents": d.server.num_docs,
            "keyword_universe_size": len(d.dataset.universe),
            "total_queries_logged": len(d.server.leakage_log),
            "distinct_tokens_observed": len(d.server.query_frequency),
            "stream_generated": d.stream_weeks > 0,
            "leakage_built": d.leakage is not None,
            "jigsaw_stage": d.run.stage if d.run else 0,
            "revealed": d.revealed,
            "default_params": config.DEFAULT_ATTACK_PARAMS,
            "setup_seconds": round(d.setup_seconds, 2),
        }


@app.post("/api/reset")
def reset(req: ResetRequest):
    with STATE_LOCK:
        STATE["demo"] = DemoState(req.preset)
    return status()


# ============================== Client ==============================
@app.get("/api/client/keywords")
def client_keywords(prefix: str = "", limit: int = 20):
    """Gợi ý từ khóa cho ô search (client biết keyword universe của chính mình)."""
    d = demo()
    p = prefix.strip().lower()
    return {"keywords": [kw for kw in d.dataset.universe if kw.startswith(p)][:limit]}


@app.post("/api/search")
def search(req: SearchRequest):
    with STATE_LOCK:
        d = demo()
        res = d.client.search(req.query, source="client")
        if res is None:
            raise HTTPException(404, f"'{req.query}' is not in the keyword universe (try e.g. meeting, contract, price).")
        positions = res["positions"]
        return {
            "plaintext_query": req.query,
            "normalized_keyword": res["keyword"],
            "encrypted_token": res["token"],
            "result_count": int(len(positions)),
            "returned_doc_ids": [doc_id_str(int(p)) for p in positions[:200]],
            "documents": res["documents"][: config.MAX_DOCS_RETURNED_TO_CLIENT],
            "server_knows_plaintext": False,
        }


# ============================== SSE Server ==============================
def _token_rows(d, limit):
    tokens, volume, freq, cooc = d.server_cooccurrence()
    order = np.argsort(-freq)[:limit]
    rows = []
    for i in order:
        c = cooc[i].copy()
        c[i] = -1
        top = np.argsort(-c)[:3]
        rows.append({
            "token": tokens[i],
            "frequency": int(freq[i]),
            "volume": int(volume[i]),
            "top_cooccurring_tokens": [tokens[j] for j in top if c[j] > 0],
        })
    return rows


@app.get("/api/leakage")
def leakage(limit: int = 200):
    """Những gì server quan sát được -- KHÔNG có plaintext keyword hay nội dung tài liệu."""
    with STATE_LOCK:
        d = demo()
        return {"tokens": _token_rows(d, limit)}


@app.get("/api/server/view")
def server_view(limit: int = 100, heatmap_size: int = 12):
    with STATE_LOCK:
        d = demo()
        s = d.server
        tokens, volume, freq, cooc = d.server_cooccurrence()
        top = list(np.argsort(-freq)[:heatmap_size])
        heat = []
        for i in top:
            row = []
            for j in top:
                denom = float(np.sqrt(volume[i] * volume[j])) or 1.0
                row.append({"count": int(cooc[i, j]), "norm": float(cooc[i, j] / denom)})
            heat.append(row)
        recent = []
        for e in s.leakage_log[-15:][::-1]:
            recent.append({
                "seq": e["seq"], "week": e["week"], "source": e["source"], "token": e["token"],
                "result_count": e["result_count"],
                "returned_doc_ids": [doc_id_str(int(p)) for p in e["doc_positions"][:6]],
                "timestamp": e["timestamp"],
            })
        last = None
        client_entries = [e for e in s.leakage_log if e["source"] == "client"]
        if client_entries:
            e = client_entries[-1]
            last = {
                "token": e["token"],
                "result_count": e["result_count"],
                "frequency": int(s.query_frequency[e["token"]]),
                "returned_doc_ids": [doc_id_str(int(p)) for p in e["doc_positions"][:40]],
                "ciphertexts": [{"doc_id": doc_id_str(int(p)), "ciphertext": s.ciphertext_preview(int(p))}
                                for p in e["doc_positions"][:5]],
                "top_cooccurring_tokens": next(
                    (r["top_cooccurring_tokens"] for r in _token_rows(d, len(tokens)) if r["token"] == e["token"]), []),
            }
        return {
            "num_documents": s.num_docs,
            "total_queries": len(s.leakage_log),
            "distinct_tokens": len(tokens),
            "tokens": _token_rows(d, limit),
            "recent_log": recent,
            "last_client_query": last,
            "heatmap": {"tokens": [tokens[i] for i in top], "cells": heat},
            "server_knows_plaintext": False,
        }


# ============================== Attacker ==============================
@app.post("/api/attacker/generate_stream")
def generate_stream(req: StreamRequest):
    """Mô phỏng nhiều nhân viên tìm kiếm trong nhiều tuần; tần suất theo query_trend thật của Enron."""
    with STATE_LOCK:
        d = demo()
        weeks = req.weeks or d.cfg["observe_weeks"]
        qpw = req.queries_per_week or d.cfg["queries_per_week"]
        universe = d.dataset.universe
        t0 = time.time()
        for w in range(weeks):
            wk = config.OBSERVE_OFFSET + d.stream_weeks + w
            f = d.dataset.weekly_frequency(wk, wk + 1)
            for kw in d.rng.choice(universe, qpw, replace=True, p=f):
                d.client.search(str(kw), source="stream", week=d.stream_weeks + w + 1, decrypt=False)
        d.stream_weeks += weeks
        d.leakage = None
        d.run = None
        d.revealed = False
        d.countermeasure_results = {}
        return {
            "generated_queries": weeks * qpw,
            "weeks": weeks,
            "total_queries_logged": len(d.server.leakage_log),
            "distinct_tokens_observed": len(d.server.query_frequency),
            "seconds": round(time.time() - t0, 2),
        }


@app.post("/api/attacker/build_leakage")
def build_leakage():
    with STATE_LOCK:
        d = demo()
        if not d.server.leakage_log:
            raise HTTPException(409, "No queries observed yet. Generate the query stream first.")
        t0 = time.time()
        d.get_knowledge()
        d.leakage = ObservedLeakage(d.server)
        d.run = None
        d.revealed = False
        d.countermeasure_results = {}
        return {
            "distinct_tokens": len(d.leakage.tokens),
            "total_queries": d.leakage.num_queries,
            "num_documents": int(d.leakage.real_query_d.shape[1]),
            "external_keywords": len(d.knowledge.keywords),
            "external_documents": int(d.knowledge.sim_kw_d.shape[1]),
            "seconds": round(time.time() - t0, 2),
        }


@app.get("/api/attacker/view")
def attacker_view(limit: int = 30, keyword: str = ""):
    with STATE_LOCK:
        d = demo()
        k = d.get_knowledge()
        rows = k.table(limit)
        lookup = None
        if keyword:
            kw = d.dataset.normalize_query(keyword)
            if kw is not None:
                i = k.keywords.index(kw)
                lookup = {"query": keyword, "keyword": kw, "volume": float(k.sim_V[i]),
                          "frequency": float(k.sim_F[i]),
                          "rank_by_frequency": int((k.sim_F > k.sim_F[i]).sum()) + 1}
        observed = None
        if d.leakage is not None:
            L = d.leakage
            order = np.argsort(-L.real_F)[:limit]
            observed = [{"token": L.tokens[i], "volume": float(L.real_V[i]), "frequency": float(L.real_F[i]),
                         "volume_count": int(L.volume_count[i]), "frequency_count": int(L.counts[i])}
                        for i in order]
        return {
            "external_knowledge": rows,
            "external_keyword_count": len(k.keywords),
            "external_documents": int(k.sim_kw_d.shape[1]),
            "lookup": lookup,
            "observed_leakage": observed,
            "observed_token_count": len(d.leakage.tokens) if d.leakage is not None else 0,
        }


def _new_run(d, params, countermeasure):
    if d.leakage is None:
        raise HTTPException(409, "Build SSE leakage first.")
    if countermeasure not in config.COUNTERMEASURES:
        raise HTTPException(400, "countermeasure must be one of none, padding, obfuscation")
    return JigsawRun(d.get_knowledge(), d.leakage, params, countermeasure,
                     config.COUNTERMEASURES[countermeasure], np.random.default_rng(config.SEED))


def _attach_truth(d, preds):
    for p in preds:
        p["true_keyword"] = d.client.ground_truth(p["token"])
        p["correct"] = p["true_keyword"] == p["predicted_keyword"]
    return preds


@app.post("/api/jigsaw/step/{n}")
def jigsaw_step(n: int, req: StepRequest):
    with STATE_LOCK:
        d = demo()
        t0 = time.time()
        if n == 1:
            d.run = _new_run(d, req.model_dump(), req.countermeasure)
            d.revealed = False
            out = d.run.step1()
        elif n == 2:
            require_run(d, 1)
            out = d.run.step2()
        elif n == 3:
            require_run(d, 2)
            out = d.run.step3()
        else:
            raise HTTPException(404, "step must be 1, 2 or 3")
        out["seconds"] = round(time.time() - t0, 2)
        out["stage"] = d.run.stage
        out["params"] = d.run.params
        out["label"] = "prediction"
        return out


@app.get("/api/jigsaw/predictions")
def jigsaw_predictions(limit: int = 500):
    with STATE_LOCK:
        d = demo()
        require_run(d, 1)
        preds = d.run.predictions()[:limit]
        if d.revealed:
            _attach_truth(d, preds)
        return {"label": "prediction", "revealed": d.revealed, "stage": d.run.stage,
                "total": len(d.run.predictions()), "predictions": preds}


@app.get("/api/jigsaw/accuracy")
def jigsaw_accuracy():
    """Điểm số do 'evaluator' (dùng oracle của client) tính sau khi đã có prediction."""
    with STATE_LOCK:
        d = demo()
        require_run(d, 1)
        return d.run.evaluate(d.client.ground_truth)


@app.post("/api/jigsaw/reveal")
def jigsaw_reveal():
    with STATE_LOCK:
        d = demo()
        require_run(d, 1)
        d.revealed = True
        return {"revealed": True}


@app.post("/api/jigsaw/run")
def jigsaw_run(req: RunRequest):
    with STATE_LOCK:
        d = demo()
        t0 = time.time()
        d.run = _new_run(d, req.model_dump(), req.countermeasure)
        d.run.run_all()
        d.revealed = req.reveal
        acc = d.run.evaluate(d.client.ground_truth)
        preds = d.run.predictions()
        if req.reveal:
            _attach_truth(d, preds)
        return {
            "label": "prediction",
            "accuracy": acc["accuracy"],
            "total_queries": acc["total_queries"],
            "correct_predictions": acc["correct_predictions"],
            "stages": {k: acc[k] for k in ("step1", "step2", "final")},
            "keyword_universe_size": len(d.dataset.universe),
            "predictions": preds,
            "seconds": round(time.time() - t0, 2),
        }


@app.post("/api/countermeasure/run")
def countermeasure_run(req: CountermeasureRequest):
    with STATE_LOCK:
        d = demo()
        if req.method not in config.COUNTERMEASURES:
            raise HTTPException(400, "method must be one of none, padding, obfuscation")
        params = req.model_dump(exclude={"method"})
        key = tuple(sorted(params.items()))

        def run_with(method):
            ck = (method, key)
            if ck not in d.countermeasure_results:
                t0 = time.time()
                r = _new_run(d, params, method)
                r.run_all()
                acc = r.evaluate(d.client.ground_truth)
                d.countermeasure_results[ck] = {
                    "accuracy": acc["accuracy"],
                    "distinct_accuracy": acc["final"]["distinct"],
                    **overhead(d.leakage.real_query_d, r.real_query_d, d.leakage.counts),
                    "seconds": round(time.time() - t0, 2),
                }
            return d.countermeasure_results[ck]

        before = run_with("none")
        after = run_with(req.method)
        return {
            "method": req.method,
            "countermeasure_params": config.COUNTERMEASURES[req.method],
            "accuracy_before": before["accuracy"],
            "accuracy_after": after["accuracy"],
            "before": before,
            "after": after,
            "message": COUNTERMEASURE_MESSAGES[req.method],
        }
