# jigsaw_demo.md — Hướng dẫn xây dựng Website Demo Jigsaw SSE

## 1. Mục tiêu dự án

Xây dựng một website demo giáo dục minh họa đầy đủ flow của **Jigsaw Attack against Searchable Symmetric Encryption (SSE)** từ paper Query Recovery from Easy to Hard: Jigsaw Attack against SSE

Website phải cho phép người xem hiểu rõ:

1. Client nhập một truy vấn plaintext, ví dụ `meeting`.
2. Client mã hóa truy vấn thành token, ví dụ `td_018`, trước khi gửi tới server.
3. SSE Server chỉ nhìn thấy token mã hóa, không nhìn thấy plaintext.
4. Server trả về danh sách tài liệu/email khớp truy vấn.
5. Server ghi lại leakage: query token, result count, returned document IDs, query frequency.
6. Attacker thu thập leakage và đối chiếu với external knowledge.
7. Jigsaw Attack dùng volume, frequency và co-occurrence để dự đoán từ khóa gốc của từng token.
8. Jigsaw **không** giải mã plaintext tài liệu; nó chỉ thực hiện **query recovery**.

Thông điệp bảo mật cốt lõi phải luôn hiển thị rõ:

```text
Client biết plaintext.
Server chỉ biết encrypted token và leakage.
Jigsaw dự đoán từ khóa gốc, nhưng không đọc được plaintext.
```

## 2. Ngữ cảnh demo

Sử dụng dataset **Enron** từ repo JigsawAttack:

- Dataset: `dataset/enron_db.pkl`
- Enron là tập email doanh nghiệp, phù hợp để mô phỏng “kho tài liệu nội bộ được bảo vệ bằng SSE”.

Câu chuyện demo:

> Một công ty lưu trữ email nội bộ trên cloud bằng SSE. Nhân viên tìm email bằng các từ khóa như `meeting`, `contract`, `energy`. Cloud provider không thấy nội dung email hay từ khóa gốc, nhưng vẫn quan sát được hành vi tìm kiếm. Jigsaw khai thác hành vi đó để đoán từ khóa.

Không được trình bày Jigsaw như một công cụ giải mã tài liệu. Jigsaw chỉ dự đoán ánh xạ:

```text
encrypted query token → original keyword
```

## 3. Dataset Jigsaw

Repo gốc JigsawAttack có cấu trúc dataset như sau:

- `dataset/enron_db.pkl`
  - `document_list`: danh sách từ khóa của từng tài liệu/email.
  - `keyword_dict`: ánh xạ mỗi từ khóa tới:
    - `total_count`: tổng số lần xuất hiện trong tài liệu.
    - `query_trend`: chuỗi tần suất truy vấn theo thời gian.

Ví dụ cấu trúc kỳ vọng:

```python
{
  "document_list": [
      ["meeting", "contract", "energy"],
      ["meeting", "energy"],
      ["contract", "energy", "deal"]
  ],
  "keyword_dict": {
      "meeting": {
          "total_count": 4200,
          "query_trend":[120][135][150]
      },
      "contract": {
          "total_count": 2800,
          "query_trend":[90][110][130]
      }
  }
}
```

Yêu cầu:

- Load `enron_db.pkl` từ thư mục `dataset/`.
- Không sửa cấu trúc file pickle gốc.
- Nếu cấu trúc thực tế khác giả định trên, phải inspect pickle trước rồi viết adapter tương ứng.
- Hạn chế số từ khóa để demo chạy nhanh, ví dụ top 1,000 keywords theo `total_count`.

## 4. Kiến trúc hệ thống

Xây dựng ứng dụng gồm backend FastAPI và frontend React trên project JigsawAttack hiện có

```text
JigsawAttack/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── dataset_loader.py
│   ├── sse_server.py
│   ├── attacker.py
│   ├── jigsaw_adapter.py
│   ├── countermeasure_adapter.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ClientPage.jsx
│   │   │   ├── ServerPage.jsx
│   │   │   └── AttackerPage.jsx
│   │   ├── components/
│   │   │   ├── SearchBox.jsx
│   │   │   ├── ResultList.jsx
│   │   │   ├── LeakageTable.jsx
│   │   │   ├── VolumeChart.jsx
│   │   │   ├── FrequencyChart.jsx
│   │   │   ├── CooccurrenceHeatmap.jsx
│   │   │   ├── PredictionTable.jsx
│   │   │   └── AccuracyChart.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── dataset/
│   └── enron_db.pkl
├── output/
└── jigsaw_demo.md
```

## 5. Công nghệ bắt buộc

### Backend

- Python 3.10+
- FastAPI
- Uvicorn
- Pydantic
- pickle
- numpy
- pandas
- matplotlib, chỉ dùng nếu cần xuất ảnh phân tích
- Tái sử dụng mã Python từ repo JigsawAttack, đặc biệt:
  - `attack/attack.py`
  - `run_single_attack.py`
  - `countermeasure.py`
  - `cal_acc.py`

### Frontend

- React 18+
- Vite
- Axios hoặc Fetch API
- Recharts hoặc ECharts
- TailwindCSS hoặc CSS Modules

Không cần dùng database thật. Dữ liệu demo có thể giữ trong bộ nhớ hoặc SQLite.
## Lưu trữ dữ liệu demo

Không cần tạo database thật cho demo này.

Dataset chính là `dataset/enron_db.pkl` có sẵn trong repo JigsawAttack. Khi backend khởi động, hãy load file pickle này vào bộ nhớ và xây các cấu trúc mô phỏng sau:

1. `plaintext_documents`: nội dung email/tài liệu, chỉ Client được thấy.
2. `encrypted_index`: ánh xạ từ encrypted query token tới danh sách document ID.
3. `leakage_log`: lịch sử token, timestamp, result_count và returned_doc_ids.
4. `query_frequency`: số lần mỗi token được truy vấn.
5. `external_knowledge`: từ điển từ khóa, volume, frequency và co-occurrence dùng cho Jigsaw.

SQLite là tùy chọn, không bắt buộc. Chỉ dùng SQLite nếu muốn giữ lịch sử truy vấn hoặc kết quả Jigsaw sau khi restart ứng dụng. Với demo trước lớp, ưu tiên in-memory storage để đơn giản, nhanh và dễ reset.


## 6. Ba vai trò trong demo

Website phải hiển thị rõ ba vai trò:

### 6.1 Client

Client là nhân viên công ty.

Client có thể:

- Nhập truy vấn plaintext, ví dụ `meeting`.
- Bấm nút Search.
- Nhận danh sách email kết quả.
- Đọc nội dung email plaintext.

Client không thấy leakage log.

### 6.2 SSE Server

Server là cloud provider hoặc hệ thống lưu trữ mã hóa.

Server chỉ được thấy:

- Encrypted query token, ví dụ `td_018`.
- Số tài liệu trả về.
- Danh sách document ID trả về.
- Tần suất token được truy vấn.
- Quan hệ đồng xuất hiện giữa các token.

Server không được thấy:

- Plaintext query.
- Plaintext document content.
- Khóa mã hóa.

### 6.3 Attacker / Jigsaw

Attacker quan sát leakage từ server.

Attacker có:

- SSE leakage: token, volume, frequency, access pattern.
- External knowledge: từ điển từ khóa, volume, frequency, co-occurrence từ Enron hoặc corpus tương tự.

Attacker không có:

- Khóa mã hóa.
- Plaintext tài liệu.
- Mapping chính xác `token → keyword` trước khi chạy Jigsaw.

Jigsaw chỉ xuất ra dự đoán:

```text
td_018 → meeting
td_204 → contract
td_311 → energy
```

## 7. Backend API bắt buộc

### 7.1 `POST /api/search`

Client gửi truy vấn plaintext.

Request:

```json
{
  "query": "meeting"
}
```

Hành vi backend:

1. Kiểm tra query có tồn tại trong keyword universe.
2. Mã hóa query thành token bằng HMAC-SHA256 với secret key chỉ client biết.
3. Tra inverted index để lấy document IDs.
4. Ghi leakage log.
5. Trả kết quả cho client.

Response:

```json
{
  "plaintext_query": "meeting",
  "encrypted_token": "td_018",
  "result_count": 4200,
  "returned_doc_ids": [
    "email_001",
    "email_014",
    "email_097"
  ],
  "documents": [
    {
      "doc_id": "email_001",
      "plaintext": "Meeting with energy supplier..."
    }
  ],
  "server_knows_plaintext": false
}
```

Lưu ý:

- `plaintext_query` và `documents.plaintext` chỉ dành cho Client UI.
- Không được gửi các trường này tới Server Page hoặc Attacker Page.

### 7.2 `GET /api/leakage`

Trả về dữ liệu server/attacker có thể quan sát.

Response:

```json
{
  "tokens": [
    {
      "token": "td_018",
      "frequency": 3100,
      "volume": 4200,
      "top_cooccurring_tokens": [
        "td_204",
        "td_311"
      ]
    }
  ]
}
```

Yêu cầu:

- Không trả về plaintext keyword.
- Không trả về plaintext document content.
- Volume và frequency phải được chuẩn hóa khi đưa vào Jigsaw.

### 7.3 `POST /api/jigsaw/run`

Chạy Jigsaw attack.

Request:

```json
{
  "alpha": 0.5,
  "beta": 0.7,
  "BaseRec": 50,
  "ConfRec": 20,
  "RefSpeed": 10,
  "keyword_universe_size": 1000
}
```

Response:

```json
{
  "accuracy": 0.87,
  "total_queries": 1000,
  "correct_predictions": 870,
  "predictions": [
    {
      "token": "td_018",
      "predicted_keyword": "meeting",
      "true_keyword": "meeting",
      "correct": true,
      "confidence": 0.96
    }
  ]
}
```

Yêu cầu:

- Chỉ trả `true_keyword` nếu frontend đang ở chế độ “Reveal ground truth”.
- Mặc định ẩn ground truth cho đến khi người dùng bấm nút reveal.
- Phải hỗ trợ chạy với số lượng token nhỏ để demo nhanh.

### 7.4 `POST /api/countermeasure/run`

Chạy lại Jigsaw sau khi áp dụng countermeasure.

Request:

```json
{
  "method": "padding",
  "alpha": 0.5,
  "beta": 0.7,
  "BaseRec": 50,
  "ConfRec": 20,
  "RefSpeed": 10
}
```

`method` chỉ nhận:

```text
none
padding
obfuscation
```

Response:

```json
{
  "method": "padding",
  "accuracy_before": 0.87,
  "accuracy_after": 0.64,
  "message": "Padding reduces volume leakage but does not eliminate query recovery risk."
}
```

## 8. Luồng dữ liệu bắt buộc

Backend phải implement đúng flow sau:

```text
1. Client nhập "meeting"
2. Client mã hóa: "meeting" → "td_018"
3. Client gửi "td_018" tới SSE Server
4. Server tra encrypted inverted index
5. Server trả về document IDs
6. Server ghi leakage:
   - token
   - result_count
   - returned_doc_ids
   - timestamp
7. Attacker đọc leakage log
8. Attacker load external knowledge từ Enron
9. Jigsaw chạy:
   - Module 1: RecoverDQ
   - Module 2: Verify
   - Module 3: RecoverAll
10. Jigsaw trả về predicted mapping
11. Frontend so sánh với ground truth chỉ khi người dùng reveal
```

## 9. Thuật toán Jigsaw cần minh họa

Không cần cài lại Jigsaw từ đầu vì đã có từ repo gốc. Tuy nhiên, UI phải giải thích rõ ba module.

### 9.1 Module 1: RecoverDQ

Mục đích: tìm các truy vấn dễ đoán.

Công thức:

```text
d_td_i = min over j != i of:
  alpha * abs(volume_td_i - volume_td_j)
  + (1 - alpha) * abs(frequency_td_i - frequency_td_j)
```

Sau đó:

1. Sắp xếp truy vấn theo `d` giảm dần.
2. Chọn `BaseRec` truy vấn nổi bật nhất.
3. Ghép mỗi truy vấn với từ khóa có volume/frequency gần nhất.

UI cần hiển thị:

```text
Selected distinctive queries:
td_018 → candidate: meeting
td_204 → candidate: contract
td_311 → candidate: energy
```

### 9.2 Module 2: Verify

Mục đích: kiểm tra dự đoán bằng co-occurrence.

Công thức:

```text
revconf_i = euclidean_distance(
  normalized_cooccurrence_row_query_i,
  normalized_cooccurrence_row_keyword_i
)
```

Hành vi:

1. Tạo ma trận co-occurrence con cho các cặp đã dự đoán.
2. Chuẩn hóa từng hàng.
3. Tính khoảng cách Euclidean.
4. Loại các cặp có `revconf` cao nhất.
5. Giữ lại `ConfRec` mỏ neo tin cậy.

UI cần hiển thị:

```text
Verified anchors:
td_018 → meeting
td_204 → contract
```

### 9.3 Module 3: RecoverAll

Mục đích: dùng mỏ neo để khôi phục các truy vấn còn lại.

Công thức score:

```text
score(td, w) =
  -ln(
    beta * cooccurrence_distance(td, w)
    + (1 - beta) * statistical_distance(td, w)
  )
```

Certainty:

```text
certainty(td, best_w) =
  score(td, best_w)
  - max score of second-best keyword
```

Hành vi:

1. Với mỗi token chưa giải, tính score với mọi từ khóa chưa ghép.
2. Chọn từ khóa có score cao nhất.
3. Tính certainty.
4. Mỗi vòng chỉ nhận tối đa `RefSpeed` cặp có certainty cao nhất.
5. Cập nhật mỏ neo và lặp lại đến khi hết token.

UI cần hiển thị từng vòng:

```text
Round 1:
td_311 → energy
td_407 → deal

Round 2:
td_512 → audit
td_619 → settlement
```

## 10. Giao diện bắt buộc

Website cần có 3 tab chính.

### 10.1 Tab Client

Tên tab: `Client`

Chứa:

- Ô nhập query.
- Nút `Search`.
- Hiển thị encrypted token.
- Hiển thị danh sách email kết quả.
- Hiển thị plaintext email chỉ trong tab Client.
- Cảnh báo: “Server only sees the encrypted token.”

### 10.2 Tab SSE Server

Tên tab: `SSE Server`

Chứa:

- Bảng leakage: token, frequency, volume.
- Danh sách document IDs trả về gần nhất.
- Biểu đồ top token theo frequency.
- Biểu đồ top token theo volume.
- Heatmap co-occurrence.
- Cảnh báo: “Server does not know plaintext keywords.”

### 10.3 Tab Attacker / Jigsaw

Tên tab: `Attacker / Jigsaw`

Chứa:

- External knowledge table.
- Observed leakage table.
- Nút chạy từng bước:
  - `Generate query stream`
  - `Build SSE leakage`
  - `Select distinctive queries`
  - `Verify with co-occurrence`
  - `Recover remaining queries`
  - `Show accuracy`
- Bảng prediction.
- Nút `Reveal ground truth`.
- Biểu đồ accuracy.
- Toggle countermeasure:
  - None
  - Padding
  - Obfuscation

## 11. Kịch bản demo chuẩn

Khi mở website, người trình bày thực hiện theo thứ tự:

### Bước 1: Client search

Nhập:

```text
meeting
```

Nhấn `Search`.

Kỳ vọng hiển thị:

```text
Client query: meeting
Encrypted token: td_018
Server response: 4,200 documents
```

### Bước 2: Xem SSE Server

Chuyển sang tab `SSE Server`.

Kỳ vọng hiển thị:

```text
Token: td_018
Frequency: 3,100
Volume: 4,200
Top co-occurring tokens: td_204, td_311
```

### Bước 3: Xem Attacker knowledge

Chuyển sang tab `Attacker / Jigsaw`.

Kỳ vọng hiển thị:

```text
External keyword: meeting
External volume: 0.41
External frequency: 0.31
```

### Bước 4: Chạy Jigsaw từng bước

Nhấn lần lượt:

```text
Select distinctive queries
Verify with co-occurrence
Recover remaining queries
Show accuracy
```

Kỳ vọng hiển thị dự đoán:

```text
td_018 → meeting
td_204 → contract
td_311 → energy
```

### Bước 5: Reveal ground truth

Nhấn `Reveal ground truth`.

Website so sánh:

```text
Predicted: meeting
Ground truth: meeting
Correct: Yes
```

### Bước 6: Chạy countermeasure

Chọn `Padding`.

Chạy lại Jigsaw.

Hiển thị:

```text
Accuracy before padding: 87%
Accuracy after padding: 64%
```

## 12. Ràng buộc bảo mật demo

Bắt buộc tuân thủ:

1. Không bao giờ cho SSE Server biết plaintext query.
2. Không bao giờ cho Attacker biết plaintext document content.
3. Không cho Attacker biết khóa mã hóa.
4. Chỉ Client Page được hiển thị plaintext document.
5. Ground truth chỉ được reveal sau khi Jigsaw đưa ra prediction.
6. Mọi kết quả Jigsaw phải được ghi nhãn là `prediction`, không phải `decryption`.
7. Không được dùng thuật ngữ “decrypt” cho đầu ra của Jigsaw.
8. Phải phân biệt rõ:
   - Query recovery
   - Plaintext recovery
   - Key recovery

## 13. Cách tích hợp repo JigsawAttack

1. Ưu tiên tái sử dụng mã gốc đã xây dựng từ repo JigsawAttack
2. Bổ sung `READMEDEMO.md`. cho phần bổ sung demo này.

## 14. Yêu cầu về hiệu năng demo

Demo phải chạy nhanh trên laptop thông thường.

Hạn chế mặc định:

```text
keyword_universe_size = 1000
number_of_queries = 5000
BaseRec = 50
ConfRec = 20
RefSpeed = 10
```

Nếu Enron quá lớn:

- Giới hạn top 1,000 keywords theo `total_count`.
- Giới hạn số document liên quan.
- Cache leakage matrix trong bộ nhớ.
- Cho phép người dùng chọn `Fast demo` hoặc `Full experiment`.

## 15. Tiêu chí hoàn thành

Dự án được coi là hoàn thành khi:

1. Client có thể nhập `meeting` và nhận kết quả email.
2. Server chỉ hiển thị `td_018`, không hiển thị `meeting`.
3. Server hiển thị được volume, frequency và co-occurrence.
4. Attacker có thể chạy Jigsaw và nhận bảng prediction.
5. Website hiển thị được accuracy.
6. Người dùng có thể bật/tắt padding và obfuscation.
7. Website hiển thị rõ Jigsaw không giải mã plaintext.
8. Toàn bộ flow Client → Server → Attacker → Jigsaw hoạt động được.
9. Có nút reset demo để chạy lại từ đầu.
10. Có chế độ step-by-step để trình bày trước lớp.

## 16. Thông điệp kết thúc trên UI

Thêm một banner cố định ở cuối trang Attacker:

```text
Jigsaw performs query recovery, not plaintext recovery.
It predicts which keyword was searched,
but it cannot decrypt or read the protected documents.
```

Bản dịch hiển thị phụ:

```text
Jigsaw thực hiện khôi phục truy vấn, không phải khôi phục plaintext.
Nó dự đoán người dùng đã tìm từ khóa nào,
nhưng không thể giải mã hay đọc nội dung tài liệu được bảo vệ.
```