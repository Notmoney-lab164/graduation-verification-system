# Graduation Verification Backend API

## Base URL

```text
http://localhost:8000
```

## Project Pages

| Page | Route goi y | Muc dich |
|---|---|---|
| Public Verify Page | `/verify` | Nguoi dung nhap MSSV de kiem tra tot nghiep |
| Admin Dashboard | `/admin` | Admin quan ly sinh vien, dashboard, sync blockchain |
| Student Detail / Share Link | `/verify/{student_id}` | Xem chi tiet xac thuc, chia se cho doanh nghiep |

## Verify Status

| Status | Y nghia |
|---|---|
| `Verified` | Du lieu MySQL khop voi Blockchain |
| `Mismatch` | Du lieu MySQL da bi thay doi so voi Blockchain |
| `Not Synced` | Sinh vien co trong MySQL nhung chua sync Blockchain |
| `Not Registered` | Khong tim thay sinh vien trong MySQL |

---

# 1. Admin Login

## POST `/api/auth/login`

Dung cho trang dang nhap admin.

### Request

```json
{
  "username": "admin",
  "password": "123456"
}
```

### Response

```json
{
  "access_token": "...",
  "token_type": "bearer"
}
```

Frontend luu token va gui vao header khi goi API admin:

```text
Authorization: Bearer <access_token>
```

---

# 2. Admin Dashboard APIs

Tat ca API admin ben duoi can header:

```text
Authorization: Bearer <access_token>
```

## GET `/api/admin/stats`

Dung cho cac o thong ke tren dashboard.

### Response Example

```json
{
  "total_students": 1,
  "graduated_students": 1,
  "not_graduated_students": 0,
  "pending_students": 0,
  "synced_blockchain": 1,
  "not_synced_blockchain": 0,
  "graduation_status": {
    "GRADUATED": 1
  },
  "mismatch_count": 0
}
```

## GET `/api/admin/students`

Dung cho bang danh sach sinh vien.

### Query Params

| Param | Bat buoc | Mo ta |
|---|---|---|
| `page` | Khong | Trang hien tai, mac dinh `1` |
| `page_size` | Khong | So dong moi trang, mac dinh `20` |
| `search` | Khong | Tim theo MSSV hoac ho ten |
| `graduation_status` | Khong | Loc theo trang thai tot nghiep |

### Example

```text
GET /api/admin/students?page=1&page_size=20
GET /api/admin/students?search=SV001
GET /api/admin/students?graduation_status=GRADUATED
```

### Response Example

```json
{
  "items": [
    {
      "student_id": "SV001",
      "full_name": "Nguyen Van A",
      "date_of_birth": "2002-05-10",
      "citizen_id_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "email": "sv001@fpt.edu.vn",
      "institution_code": "FPTU",
      "institution_name": "FPT University",
      "faculty_name": "Information Technology",
      "major": "Software Engineering",
      "training_mode": "Full-time",
      "degree_id": "DEGREE001",
      "degree_type": "Bachelor",
      "graduation_status": "GRADUATED",
      "graduation_date": "2026-06-01",
      "graduation_year": 2026,
      "classification": "Good",
      "gpa": "3.20",
      "total_credits": 145,
      "entrance_year": 2022,
      "metadata_hash": "...",
      "blockchain_tx_id": "mock-tx-SV001",
      "updated_by": "admin",
      "created_at": "2026-06-10T07:52:58",
      "updated_at": "2026-06-10T07:52:58"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
```

## POST `/api/admin/students`

Them sinh vien moi.

### Request Example

```json
{
  "student_id": "SV001",
  "full_name": "Nguyen Van A",
  "date_of_birth": "2002-05-10",
  "citizen_id_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "email": "sv001@fpt.edu.vn",
  "institution_code": "FPTU",
  "institution_name": "FPT University",
  "faculty_name": "Information Technology",
  "major": "Software Engineering",
  "training_mode": "Full-time",
  "degree_id": "DEGREE001",
  "degree_type": "Bachelor",
  "graduation_status": "GRADUATED",
  "graduation_date": "2026-06-01",
  "graduation_year": 2026,
  "classification": "Good",
  "gpa": 3.2,
  "total_credits": 145,
  "entrance_year": 2022
}
```

### Response

Tra ve thong tin sinh vien vua tao, kem `metadata_hash`.

## GET `/api/admin/students/{student_id}`

Xem chi tiet mot sinh vien trong admin.

### Example

```text
GET /api/admin/students/SV001
```

## PUT `/api/admin/students/{student_id}`

Sua thong tin sinh vien.

### Request Example

```json
{
  "gpa": 3.5,
  "classification": "Very Good"
}
```

### Note

Neu sinh vien da sync Blockchain, sau khi sua thong tin thi hash MySQL thay doi. Luc nay verify co the tra ve `Mismatch` cho den khi admin sync Blockchain lai.

## DELETE `/api/admin/students/{student_id}`

Xoa sinh vien.

### Example

```text
DELETE /api/admin/students/SV001
```

## POST `/api/admin/students/{student_id}/sync-blockchain`

Dong bo `metadata_hash` cua sinh vien len Blockchain.

### Muc dich

Chot du lieu xac thuc len Blockchain de sau nay phat hien MySQL co bi sua hay khong.

### Example

```text
POST /api/admin/students/SV001/sync-blockchain
```

### Response Example

```json
{
  "message": "Student synced to blockchain",
  "student_id": "SV001",
  "metadata_hash": "...",
  "tx_id": "mock-tx-SV001",
  "synced_at": "2026-06-10T08:02:24.725002Z"
}
```

## POST `/api/admin/students/{student_id}/simulate-tamper`

Demo sua GPA trong MySQL de kiem tra Blockchain phat hien du lieu bi thay doi.

### Example

```text
POST /api/admin/students/SV001/simulate-tamper
```

### Ket qua

```text
GPA trong MySQL bi doi thanh 3.90.
metadata_hash MySQL thay doi.
Blockchain van giu hash cu.
GET /api/verify/SV001 se tra ve Mismatch.
```

---

# 3. Public Verify APIs

Public API khong can token.

## GET `/api/verify/{student_id}`

Dung cho trang nguoi dung nhap MSSV de kiem tra tot nghiep.

### Example

```text
GET /api/verify/SV001
```

### Response: Verified

```json
{
  "student_id": "SV001",
  "full_name": "Nguyen Van A",
  "graduation_status": "GRADUATED",
  "verification_status": "Verified",
  "message": "Student data is verified on blockchain.",
  "metadata_hash_mysql": "...",
  "metadata_hash_blockchain": "...",
  "blockchain_tx_id": "mock-tx-SV001"
}
```

### Response: Not Synced

```json
{
  "student_id": "SV001",
  "full_name": "Nguyen Van A",
  "graduation_status": "GRADUATED",
  "verification_status": "Not Synced",
  "message": "Student exists in MySQL but has not been synced to blockchain yet.",
  "metadata_hash_mysql": "...",
  "metadata_hash_blockchain": null,
  "blockchain_tx_id": null
}
```

### Response: Mismatch

```json
{
  "student_id": "SV001",
  "full_name": "Nguyen Van A",
  "graduation_status": "GRADUATED",
  "verification_status": "Mismatch",
  "message": "Student data hash does not match blockchain record.",
  "metadata_hash_mysql": "...",
  "metadata_hash_blockchain": "...",
  "blockchain_tx_id": "mock-tx-SV001"
}
```

### Response: Not Registered

```json
{
  "student_id": "SV999",
  "full_name": null,
  "graduation_status": "UNKNOWN",
  "verification_status": "Not Registered",
  "message": "Student does not exist in MySQL.",
  "metadata_hash_mysql": null,
  "metadata_hash_blockchain": null,
  "blockchain_tx_id": null
}
```

## GET `/api/verify/{student_id}/export-pdf`

Tai file PDF ket qua xac thuc.

### Example

```text
GET /api/verify/SV001/export-pdf
```

### Response

```text
Content-Type: application/pdf
File name: graduation-verification-SV001.pdf
```

Dung cho nut:

```text
Tai PDF
```

---

# 4. Student Detail / Share Link

Trang detail dung lai API:

```text
GET /api/verify/{student_id}
```

Frontend route goi y:

```text
/verify/SV001
```

Trang nay nen hien thi:

| Field | Mo ta |
|---|---|
| `student_id` | MSSV |
| `full_name` | Ho ten |
| `graduation_status` | Trang thai tot nghiep |
| `gpa` | Diem GPA, lay tu API admin hoac bo sung vao verify response |
| `metadata_hash_mysql` | Hash tinh tu du lieu MySQL |
| `metadata_hash_blockchain` | Hash luu tren Blockchain |
| `blockchain_tx_id` | Transaction ID |
| `verification_status` | Ket qua xac thuc |
| PDF button | Goi `/api/verify/{student_id}/export-pdf` |

---

# 5. Main Demo Flow

```text
1. Admin dang nhap lay token.
2. Admin them sinh vien.
3. User verify lan dau: Not Synced.
4. Admin sync Blockchain.
5. User verify lai: Verified.
6. Admin simulate tamper GPA.
7. User verify lai: Mismatch.
8. User tai PDF ket qua xac thuc.
```

---

# 6. Frontend Notes

## Auth

Admin API can header:

```text
Authorization: Bearer <access_token>
```

Public verify API khong can token.

## Status Color Mapping

| Status | Mau goi y |
|---|---|
| `Verified` | Xanh |
| `Mismatch` | Do |
| `Not Synced` | Vang |
| `Not Registered` | Xam |

## Important Note

Hien tai backend dang dung mock blockchain service, nen `tx_id` co dang:

```text
mock-tx-SV001
```

Khi noi Hyperledger Fabric that, `tx_id` se la transaction ID that tu Fabric.
