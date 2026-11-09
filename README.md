# Jigsaw Attack against SSE — Seminar & Demo

Repo gồm hai phần:

1. **Mã gốc** của paper *“Query Recovery from Easy to Hard: Jigsaw Attack against SSE”*: hiện thực Jigsaw cùng các tấn công so sánh (RSA, IHOP, SAP, Graphm) và các countermeasure.
2. **Website demo** (FastAPI + React) minh hoạ flow **Client → SSE Server → Attacker → Jigsaw** trên dataset Enron, dùng để thuyết trình trên lớp. Backend tái sử dụng trực tiếp mã gốc: `attack/attack.py` (class `Attacker`), `countermeasure.py`, `cal_acc.py`.

> Jigsaw thực hiện **query recovery**: nó dự đoán người dùng đã tìm từ khóa nào. Nó **không** khôi phục plaintext tài liệu và **không** khôi phục khóa.

---

## Phần 1 — Website demo

### Chạy demo

Cần Python 3.10+ và Node 18+. Demo chỉ cần `dataset/enron_db.pkl`, file này đã có sẵn trong repo.

```bash
# Terminal 1 — backend (cổng 8000)
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8000

# Terminal 2 — frontend (cổng 5173, proxy /api → 8000)
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173.

### Kịch bản trình bày (khoảng 5 phút)

Website có 3 tab: **Client**, **SSE Server**, **Attacker / Jigsaw**. Mỗi tab mở đầu bằng một dòng tóm tắt vai trò đó có gì (✓) và không có gì (✗).
Tab Attacker là một wizard: cột trái gồm 7 bước, ô Spotlight và tham số (thu gọn); cột phải chỉ hiển thị bước đang chọn, kèm một dòng “➜ kết luận”.
Nút **Bước tiếp →** ở cuối panel chạy bước kế tiếp, nên khi trình bày chỉ cần bấm liên tục nút này.

1. **Client**: search `meeting`. Client chuẩn hoá thành stem `meet`, tính token `td_xxxxxx` bằng HMAC-SHA256 rồi nhận khoảng 1.964 email đã giải mã.
2. **SSE Server**: chỉ thấy token, volume, frequency, danh sách document ID và ciphertext. Không có chữ “meeting” ở đâu cả.
3. **Attacker / Jigsaw**: chạy *Generate query stream* → *Build SSE leakage*. Tra `meeting` trong External knowledge (volume ≈ 0.13).
   Quay lại tab Server để thấy leakage đã dày lên (biểu đồ, heatmap).
4. Chạy *Select distinctive queries* → *Verify with co-occurrence* → *Recover remaining queries* → *Show accuracy*.
   Ô **Spotlight** cho thấy token của `meeting` được dự đoán là `meet`.
5. **Reveal ground truth**: so sánh prediction với keyword thật (preset Fast: khoảng 93% truy vấn được khôi phục đúng).
6. **Countermeasure**: chọn Padding → *Run Jigsaw again* (khoảng 93% → 55%, đổi lại băng thông ×1.27).

Nút **Reset demo** (hoặc đổi preset) xoá toàn bộ trạng thái và sinh khóa mới.

| Preset   | Keywords | Truy vấn mô phỏng | Thời gian Module 3 |
|----------|----------|-------------------|--------------------|
| fast     | 500      | 5.000 (50 tuần)   | < 1 s              |
| standard | 1.000    | 5.000             | khoảng 5 s         |
| full     | 1.000    | 25.000            | khoảng 5–10 s      |

Backend xử lý từng request một. Khi một bước chạy lâu (vd. countermeasure ở preset Full), các tab khác phải chờ bước đó xong. Trước lớp nên dùng preset **Fast**.

### Mô hình mô phỏng

| Thành phần | Cách hiện thực |
|---|---|
| Dataset | `enron_db.pkl` = `(document_list, keyword_dict)`; mỗi email là **túi từ khóa đã stem**, `keyword_dict[kw] = {count, trend}`. Adapter `dataset_loader.py` đổi tên thành `total_count` / `query_trend`, không sửa file pickle. |
| Chia dữ liệu | Giống `extract_info.get_all_for_attacks`: một nửa email là kho thật của công ty (mã hoá lên server), nửa còn lại là *dữ liệu tương tự* của attacker. |
| Token | `td_` + HMAC-SHA256(K_index, keyword), lấy 6 ký tự hex đầu. |
| Mã hoá tài liệu | Keystream SHA-256 (counter mode) với K_doc. Chỉ dùng để minh hoạ, **không** dùng cho hệ thống thật. |
| Query stream | Mỗi tuần lấy mẫu truy vấn theo `query_trend` của tuần 50–99. Attacker dùng trend tuần 0–49 làm external frequency. |
| Leakage | Server ghi `token, timestamp, week, result_count, returned_doc_ids` cho mọi truy vấn. Attacker dựng ma trận access pattern token × email từ log. |
| Jigsaw | `jigsaw_adapter.py` gọi `attack_step_1`, `attack_step_2` gốc. Module 3 kế thừa `Attacker` và tách vòng `while` của `attack_step_3` thành từng round (giữ nguyên công thức) để UI hiển thị theo vòng. |
| Accuracy | `cal_acc.calculate_acc_weighted` (tính theo tần suất truy vấn). Evaluator dùng oracle của client và **chỉ chạy sau khi đã có prediction**. |
| Padding | `countermeasure.padding_linear_2(n=500)`; attacker thích nghi giống `run_single_attack.py`. |
| Obfuscation | Cùng ngữ nghĩa với `countermeasure.obfuscate(p=0.999, q=0.02, m=1)` nhưng vector hoá bằng numpy (bản gốc lặp từng ô, quá chậm cho demo trực tiếp). Attacker thích nghi bên trong `Attacker`. Với cấu hình Fast, accuracy gần như không giảm: đây là kết quả thật của Jigsaw khi thích nghi với obfuscation, không phải lỗi. |

### Ranh giới dữ liệu giữa các vai trò

- Plaintext query và nội dung email chỉ có trong response của `POST /api/search` (tab Client).
- `/api/leakage`, `/api/server/view`, `/api/attacker/*` chỉ trả token, số đếm, document ID và ciphertext.
- `true_keyword` chỉ xuất hiện sau `POST /api/jigsaw/reveal` (hoặc `POST /api/jigsaw/run` với `reveal: true`).
- Mọi đầu ra của Jigsaw được gắn nhãn `prediction`, không bao giờ là “decryption”.

### API

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/status` | Trạng thái demo |
| POST | `/api/reset` `{preset}` | Reset (fast / standard / full) |
| POST | `/api/search` `{query}` | Client |
| GET | `/api/client/keywords?prefix=` | Gợi ý từ khóa cho client |
| GET | `/api/leakage` | Server: token, frequency, volume, top co-occurring tokens |
| GET | `/api/server/view` | Dữ liệu cho tab Server (biểu đồ, heatmap, log, ciphertext) |
| POST | `/api/attacker/generate_stream` | Mô phỏng truy vấn nhiều tuần |
| POST | `/api/attacker/build_leakage` | Snapshot leakage + external knowledge |
| GET | `/api/attacker/view?keyword=` | External knowledge / observed leakage |
| POST | `/api/jigsaw/step/{1,2,3}` | Chạy từng module (tham số `alpha, beta, BaseRec, ConfRec, RefSpeed`) |
| GET | `/api/jigsaw/predictions` | Bảng prediction |
| GET | `/api/jigsaw/accuracy` | Accuracy theo từng module |
| POST | `/api/jigsaw/reveal` | Bật ground truth |
| POST | `/api/jigsaw/run` | Chạy cả 3 module một lần |
| POST | `/api/countermeasure/run` `{method}` | `none` / `padding` / `obfuscation`: accuracy trước và sau |

### Mã nguồn demo

```
backend/   config.py · dataset_loader.py · sse_server.py · attacker.py · jigsaw_adapter.py
           countermeasure_adapter.py · main.py · requirements.txt
frontend/  src/pages/{Client,Server,Attacker}Page.jsx · src/components/* · vite.config.js
JigsawAttack_demo.md   đặc tả yêu cầu của demo
eda_data.ipynb         phân tích khám phá dataset (kết quả trong eda_results/)
```

---

## Phần 2 — Mã gốc của paper

Chạy các file `test_*.py` để mô phỏng tấn công trong các điều kiện khác nhau, và các file `generate_*.py` để vẽ kết quả.

### Dataset

Thư mục `dataset/` chứa dữ liệu.

- **Enron** (`enron_db.pkl`) và **Lucene** (`lucene_db.pkl`) đã có trong repo. Mỗi file gồm một danh sách tài liệu (mỗi tài liệu là danh sách từ khóa) và một keyword dict ánh xạ mỗi từ khóa tới tổng số lần xuất hiện và query trend.
- **Wikipedia** quá lớn cho GitHub nên **không có trong repo**. `wiki_kws_dict.pkl` ánh xạ từ khóa tới số lần xuất hiện và query trend; `wiki_doc_0.pkl` chứa danh sách từ khóa của từng tài liệu. Tải tại
  [Google Drive 1](https://drive.google.com/file/d/1ltB3oyiDV0Ef7v0dRBlXV_wwvBUwas05/view?usp=drive_link),
  [Google Drive 2](https://drive.google.com/file/d/18_RG5GiH65IAI64HE5Em7yC7hbIkfBSG/view?usp=drive_link)
  hoặc [Zenodo](https://zenodo.org/records/12683869), đặt vào `dataset/`, rồi chạy `dataset/preprocess.py` để chọn kích thước keyword universe và tiền xử lý.

`.gitignore` bỏ qua mọi file `dataset/*.pkl`, trừ `enron_db.pkl` và `lucene_db.pkl`.

### Các file

Mã các tấn công nằm trong `attack/`. File `attack.py` chứa hiện thực của Jigsaw và RSA.

| File | Mô tả |
|---|---|
| `run_single_attack.py` | Nhận tham số của một tấn công và mô phỏng trong điều kiện cho trước. |
| `test_alpha.py` / `generate_test_alpha_pics.py` | Thử Module 1 của Jigsaw với các giá trị α khác nhau / vẽ kết quả. |
| `test_base_conf_rec.py` | Thử Jigsaw với các giá trị BaseRec và ConfRec. |
| `test_beta.py` / `generate_test_beta_pics.py` | Thử Jigsaw với các giá trị β / vẽ kết quả. |
| `test_durability.py` | Thử Jigsaw với các độ lệch thời gian τ giữa frequency quan sát và kiến thức nền. |
| `show_distribution.py` | Chạy tấn công đơn giản và vẽ phân bố truy vấn. Đổi dòng 126 thành `dataset = "wiki"` hoặc `"lucene"` để dùng dataset khác. |
| `test_comparison.py` / `generate_test_comparison_pics.py` | So sánh Jigsaw, RSA, IHOP, SAP, Graphm / vẽ kết quả. |
| `test_RSA_with_nkws.py` | Thử RSA với số lượng truy vấn đã biết khác nhau. |
| `test_against_countermeasure.py` / `generate_test_against_countermeasures.py` | Thử Jigsaw, RSA, IHOP trước các countermeasure / vẽ kết quả. |
| `test_IHOP_with_different_alpha.py` | Thử IHOP với tham số α cân bằng frequency và volume. |
| `test_compare_with_IHOP_with_limited_runtime.py` | So sánh Jigsaw và IHOP khi giới hạn cùng thời gian chạy. |
| `extract_info.py` | Chuẩn bị dữ liệu đầu vào cho các tấn công. |
| `cal_acc.py` | Tính accuracy từ kết quả tấn công. |
| `countermeasure.py` | Hiện thực các countermeasure. |

### Chạy Graphm

1. Cài thư viện: `sudo apt-get install libgsl-dev`.
2. Sửa lỗi biên dịch của package Graphm:
   - Trong `graphm.h`, comment dòng 70: `//double abs(double);`
   - Trong `graphm.cpp`, comment dòng 279 và 280: `//double abs(double x) //{return (x>0)?x:-x;}`
3. Tạo thư mục `src_graphm` trong thư mục gốc của repo và đặt thư mục `graphm-0.51` vào trong đó.
