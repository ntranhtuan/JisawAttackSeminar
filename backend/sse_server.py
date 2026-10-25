"""Mô phỏng một hệ SSE tối giản: Client (giữ khóa) và SSE Server (chỉ giữ dữ liệu mã hoá).

- Token truy vấn: td_ + HMAC-SHA256(K_index, keyword) rút gọn.
- Tài liệu: mã hoá bằng keystream SHA-256 (counter mode) với K_doc -- đủ cho mục đích minh hoạ,
  không dùng cho hệ thống thật.
- Server không bao giờ nhận plaintext query / plaintext tài liệu / khóa; nó chỉ ghi lại leakage.
"""
import hashlib
import hmac
import secrets
import time
from collections import Counter

import numpy as np


def doc_id_str(i):
    return f"email_{i:05d}"


def _keystream(key, nonce, length):
    out = bytearray()
    counter = 0
    while len(out) < length:
        out += hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest()
        counter += 1
    return bytes(out[:length])


def _xor(a, b):
    return (int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).to_bytes(len(a), "big")


class SSEServer:
    """Cloud provider: lưu encrypted index + encrypted documents, ghi leakage cho mọi truy vấn."""

    def __init__(self):
        self.encrypted_index = {}  # token -> np.ndarray[int] document positions
        self.encrypted_store = []  # list[(nonce, ciphertext)]
        self.leakage_log = []
        self.query_frequency = Counter()
        self._first_seen = {}

    @property
    def num_docs(self):
        return len(self.encrypted_store)

    def upload(self, encrypted_index, encrypted_store):
        self.encrypted_index = encrypted_index
        self.encrypted_store = encrypted_store

    def search(self, token, source="client", week=None):
        doc_positions = self.encrypted_index.get(token, np.zeros(0, dtype=np.int32))
        self.query_frequency[token] += 1
        if token not in self._first_seen:
            self._first_seen[token] = len(self._first_seen)
        self.leakage_log.append({
            "seq": len(self.leakage_log) + 1,
            "timestamp": time.time(),
            "week": week,
            "source": source,
            "token": token,
            "result_count": int(len(doc_positions)),
            "doc_positions": doc_positions,  # access pattern (tham chiếu, không copy)
        })
        return doc_positions, [self.encrypted_store[i] for i in doc_positions[:20]]

    def ciphertext_preview(self, position, length=40):
        nonce, c = self.encrypted_store[position]
        return (nonce + c).hex()[:length] + "…"

    # ---- Những gì server (và attacker nghe lén server) quan sát được ----
    def observed_tokens(self):
        return sorted(self._first_seen, key=self._first_seen.get)

    def access_matrix(self):
        """Ma trận token x document (1 = document được trả về cho token) dựng từ leakage log."""
        tokens = self.observed_tokens()
        mat = np.zeros((len(tokens), self.num_docs), dtype=np.float32)
        seen = {}
        for entry in self.leakage_log:
            t = entry["token"]
            if t not in seen:
                seen[t] = True
                mat[self._first_seen[t], entry["doc_positions"]] = 1.0
        freq = np.array([self.query_frequency[t] for t in tokens], dtype=np.float64)
        return tokens, mat, freq

    def reset_leakage(self):
        self.leakage_log = []
        self.query_frequency = Counter()
        self._first_seen = {}


class SSEClient:
    """Nhân viên công ty: biết plaintext và giữ khóa bí mật (server/attacker không có)."""

    def __init__(self, dataset, server):
        self.dataset = dataset
        self.server = server
        self._k_index = secrets.token_bytes(32)
        self._k_doc = secrets.token_bytes(32)
        self._token_to_keyword = {}
        self._build_and_upload()

    def token(self, keyword):
        return "td_" + hmac.new(self._k_index, keyword.encode(), hashlib.sha256).hexdigest()[:6]

    def _encrypt(self, plaintext):
        nonce = secrets.token_bytes(12)
        data = plaintext.encode()
        ks = _keystream(self._k_doc, nonce, len(data))
        return nonce, _xor(data, ks)

    def _decrypt(self, nonce, ciphertext):
        ks = _keystream(self._k_doc, nonce, len(ciphertext))
        return _xor(ciphertext, ks).decode()

    def _build_and_upload(self):
        postings = {kw: [] for kw in self.dataset.universe}
        store = []
        for i, doc in enumerate(self.dataset.real_docs):
            for kw in set(doc):
                if kw in postings:
                    postings[kw].append(i)
            store.append(self._encrypt(" ".join(doc)))
        index = {}
        for kw, pos in postings.items():
            t = self.token(kw)
            self._token_to_keyword[t] = kw
            index[t] = np.array(pos, dtype=np.int32)
        self.server.upload(index, store)

    def search(self, query, source="client", week=None, decrypt=True):
        keyword = self.dataset.normalize_query(query)
        if keyword is None:
            return None
        token = self.token(keyword)
        positions, encrypted_docs = self.server.search(token, source=source, week=week)
        result = {"keyword": keyword, "token": token, "positions": positions}
        if decrypt:
            result["documents"] = [
                {"doc_id": doc_id_str(int(p)), "plaintext": self._decrypt(n, c)}
                for p, (n, c) in zip(positions, encrypted_docs)
            ]
        return result

    def ground_truth(self, token):
        """Oracle chỉ dùng để chấm điểm SAU khi Jigsaw đã đưa ra dự đoán (client biết khóa)."""
        return self._token_to_keyword.get(token)
