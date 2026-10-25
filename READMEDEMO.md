# Demo Jigsaw Attack against SSE

Website minh hoạ flow **Client → SSE Server → Attacker → Jigsaw** trên dataset Enron, xây theo `JigsawAttack_demo.md`.
Backend FastAPI tái sử dụng trực tiếp mã gốc của repo: `attack/attack.py` (class `Attacker`), `countermeasure.py`, `cal_acc.py`.

## Chạy demo

Cần Python 3.10+ và Node 18+.

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

## Kịch bản trình bày (khoảng 5 phút)

Tab Attacker là một wizard: cột trái là 7 bước, Spotlight và tham số (thu gọn); cột phải chỉ hiển thị bước đang chọn,
kèm một dòng “➜ kết luận”. Nút **Bước tiếp →** ở cuối panel chạy bước kế tiếp, nên khi trình bày chỉ cần bấm liên tục nút này.

1. **Client**: search `meeting`. Client chuẩn hoá thành stem `meet`, tính token `td_xxxxxx` bằng HMAC-SHA256 rồi nhận khoảng 1.964 email đã giải mã.
2. **SSE Server**: chỉ thấy token, volume, frequency, danh sách document ID và ciphertext. Không có chữ “meeting” ở đâu cả.
3. **Attacker / Jigsaw**: bấm lần lượt *Generate query stream* → *Build SSE leakage*. Tra `meeting` trong External knowledge (volume ≈ 0.13).
   Quay lại tab Server để thấy leakage đã dày lên (biểu đồ, heatmap).
4. Bấm *Select distinctive queries* → *Verify with co-occurrence* → *Recover remaining queries* → *Show accuracy*.
   Ô **Spotlight** cho thấy token của `meeting` được dự đoán là `meet`.
5. **Reveal ground truth**: so sánh prediction với keyword thật (preset Fast: khoảng 93% truy vấn được khôi phục đúng).
6. **Countermeasure**: chọn Padding → *Run Jigsaw again* (khoảng 93% → 55%, đổi lại băng thông ×1.27).

Nút **Reset demo** (hoặc đổi preset) xoá toàn bộ trạng thái và sinh khóa mới.

| Preset   | Keywords | Truy vấn mô phỏng  | Thời gian Module 3 |
|----------|----------|--------------------|--------------------|
| fast     | 500      | 5.000 (50 tuần)    | < 1 s              |
| standard | 1.000    | 5.000              | khoảng 5 s         |
| full     | 1.000    | 25.000             | khoảng 5–10 s      |

## Mô hình mô phỏng

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

## Ranh giới dữ liệu (mục 12 của spec)

- Plaintext query và nội dung email chỉ có trong response của `POST /api/search` (tab Client).
- `/api/leakage`, `/api/server/view`, `/api/attacker/*` chỉ trả token, số đếm, document ID và ciphertext.
- `true_keyword` chỉ xuất hiện sau `POST /api/jigsaw/reveal` (hoặc `POST /api/jigsaw/run` với `reveal: true`).
- Mọi đầu ra của Jigsaw được gắn nhãn `prediction`. Banner cuối trang Attacker phân biệt *query recovery* ✓ với *plaintext recovery* ✗ và *key recovery* ✗.

## API

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

## Cấu trúc thêm vào repo

```
backend/   config.py · dataset_loader.py · sse_server.py · attacker.py · jigsaw_adapter.py
           countermeasure_adapter.py · main.py · requirements.txt
frontend/  src/pages/{Client,Server,Attacker}Page.jsx · src/components/* · vite.config.js
```
