# Day 5 + Day 6 - Backend API gọi Hyperledger Fabric

## Mục tiêu

Tạo API FastAPI để backend gọi chaincode `graduation` trên Hyperledger Fabric.

- Ngày 5: API lấy thông tin sinh viên
- Ngày 6: API xác minh tốt nghiệp

---

## 1. Yêu cầu trước khi chạy

Cần chạy trước Hyperledger Fabric test-network và deploy chaincode `graduation`.

Vào test-network:

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
```

Nếu máy khác có thể là:

```bash
cd ~/fabric-samples/test-network
```

Kiểm tra Docker:

```bash
docker ps
```

Phải thấy 3 container:

```txt
peer0.org1.example.com
peer0.org2.example.com
orderer.example.com
```

---

## 2. Chạy backend FastAPI

Vào backend:

```bash
cd ~/graduation-verification-system/backend
source venv/bin/activate
```

Chạy server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Nếu chạy đúng sẽ thấy:

```txt
Application startup complete.
```

Backend chạy tại:

```txt
http://localhost:8000
```

---

## 3. File cấu hình `.env`

Trong thư mục backend cần có file `.env`:

```env
FABRIC_TESTNET=/home/trien_rg9999/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=graduation
FABRIC_MSP_ID=Org1MSP
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_QUERY_TIMEOUT=10
```

Lưu ý: không push `.env` lên GitHub.

---

# Ngày 5 - API lấy thông tin sinh viên

## API

```txt
GET /api/students/{studentId}
```

API này gọi chaincode:

```txt
queryStudent
```

## Test sinh viên tồn tại

```bash
curl -s http://localhost:8000/api/students/SE182026 | jq
```

Kết quả mong đợi:

```json
{
  "success": true,
  "data": {
    "studentId": "SE182026"
  }
}
```

Dữ liệu thực tế sẽ có nhiều field hơn.

## Test sinh viên không tồn tại

```bash
curl -s http://localhost:8000/api/students/ZZ999999 | jq
```

Kết quả mong đợi:

```json
{
  "success": false,
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Student ZZ999999 does not exist"
  }
}
```

## Test sai định dạng mã sinh viên

```bash
curl -s 'http://localhost:8000/api/students/!@#$%**((' | jq
```

Kết quả mong đợi:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STUDENT_ID",
    "message": "Mã sinh viên không hợp lệ. Vui lòng nhập đúng định dạng gồm 2 chữ cái in hoa và 6 chữ số, ví dụ: SE182026"
  }
}
```

---

# Ngày 6 - API xác minh tốt nghiệp

## API

```txt
GET /api/students/{studentId}/verify
```

API này gọi 2 hàm chaincode:

```txt
verifyGraduation
verifyStudentIntegrity
```

Ý nghĩa:

- `verifyGraduation`: kiểm tra trạng thái tốt nghiệp
- `verifyStudentIntegrity`: kiểm tra dữ liệu có còn nguyên vẹn không

## Test sinh viên đã tốt nghiệp

```bash
curl -s http://localhost:8000/api/students/SE182026/verify | jq
```

Kết quả mong đợi:

```json
{
  "success": true,
  "data": {
    "studentId": "SE182026",
    "graduationStatus": "GRADUATED",
    "isGraduated": true,
    "integrityValid": true
  }
}
```

## Test sinh viên không tồn tại

```bash
curl -s http://localhost:8000/api/students/ZZ999999/verify | jq
```

Kết quả mong đợi:

```json
{
  "success": false,
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Student ZZ999999 does not exist"
  }
}
```

## Test sai định dạng mã sinh viên

```bash
curl -s 'http://localhost:8000/api/students/!@#$%**((/verify' | jq
```

Kết quả mong đợi:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STUDENT_ID"
  }
}
```

---

## 4. Quy tắc mã sinh viên

Hiện tại backend chỉ chấp nhận mã sinh viên dạng:

```txt
2 chữ cái in hoa + 6 chữ số
```

Ví dụ hợp lệ:

```txt
SE182026
IT182026
BA182026
```

Ví dụ không hợp lệ:

```txt
SV001
se182026
!@#$%**((
SE18
SE182026999
```

Regex sử dụng trong backend:

```python
STUDENT_ID_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{6}$")
```

---

## 5. Các lỗi đã xử lý

| Trường hợp | HTTP code | Error code |
|---|---:|---|
| Sinh viên không tồn tại | 404 | STUDENT_NOT_FOUND |
| Mã sinh viên sai định dạng | 400 | INVALID_STUDENT_ID |
| Fabric network chưa chạy | 503 | FABRIC_UNAVAILABLE |
| Fabric query timeout | 504 | FABRIC_TIMEOUT |
| Fabric trả lỗi khác | 502 | FABRIC_QUERY_FAILED |

---

## 6. Commit sau khi làm xong

```bash
cd ~/graduation-verification-system
git status
git add backend/main.py backend/fabric_client.py backend/requirements.txt docs/day5-day6-backend-api.md
git commit -m "Add backend API guide for Fabric integration"
git push
```
