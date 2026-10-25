"""Cấu hình chung cho demo Jigsaw SSE."""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
DATASET_PATH = os.path.join(REPO_ROOT, "dataset", "enron_db.pkl")
OUTPUT_DIR = os.path.join(REPO_ROOT, "output")

# Cho phép import mã gốc của repo: attack/attack.py, countermeasure.py, cal_acc.py
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

SEED = 2024

# Các preset kích thước demo. "standard" khớp mặc định trong JigsawAttack_demo.md (mục 14).
PRESETS = {
    "fast": {"keyword_universe_size": 500, "observe_weeks": 50, "queries_per_week": 100},
    "standard": {"keyword_universe_size": 1000, "observe_weeks": 50, "queries_per_week": 100},
    "full": {"keyword_universe_size": 1000, "observe_weeks": 50, "queries_per_week": 500},
}
DEFAULT_PRESET = "fast"

# Query của người dùng được sinh từ trend tuần [OBSERVE_OFFSET, OBSERVE_OFFSET + weeks),
# còn attacker dùng trend tuần [0, weeks) làm kiến thức nền (giống run_single_attack.py).
OBSERVE_OFFSET = 50

DEFAULT_ATTACK_PARAMS = {
    "alpha": 0.5,
    "beta": 0.7,
    "BaseRec": 50,
    "ConfRec": 20,
    "RefSpeed": 10,
}

# Tham số countermeasure lấy theo test_against_countermeasure.py (Enron).
COUNTERMEASURES = {
    "none": {"alg": None},
    "padding": {"alg": "padding_linear_2", "n": 500},
    "obfuscation": {"alg": "obfuscation", "p": 0.999, "q": 0.02, "m": 1},
}

MAX_DOCS_RETURNED_TO_CLIENT = 20
