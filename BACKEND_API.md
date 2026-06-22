# Graduation Verification Backend API

Tai lieu ket noi Frontend React voi Backend FastAPI cho he thong xac minh tot nghiep.

## 1. Thong tin chung

| Noi dung | Gia tri |
|---|---|
| Base URL local | `http://localhost:8000` |
| Swagger | `http://localhost:8000/docs` |
| Database nghiep vu | MySQL |
| Blockchain xac minh | Hyperledger Fabric |
| Fabric channel | `mychannel` |
| Fabric chaincode | `graduation` |

### Quy tac he thong

- Frontend chi goi FastAPI, khong ket noi truc tiep MySQL, Fabric hoac CouchDB.
- Backend tinh SHA-256 tu `student_id`, `gpa`, `graduation_status`.
- Backend ghi hash len Hyperledger Fabric va so sanh hash khi verify.
- Cac API bat dau bang `/api/admin/` can JWT token.
- Cac API verify, OTP va gui yeu cau la public.

---

## 2. Trang React va luong chinh

| Trang | Muc dich | API chinh |
|---|---|---|
| `/login` | Dang nhap Admin | `POST /api/auth/login` |
| `/admin` | Dashboard va quan ly | `/api/admin/...` |
| `/verify` | Nhap MSSV de tra cuu | `GET /api/verify/{student_id}` |
| `/verify/:studentId` | Chi tiet ket qua xac minh | `GET /api/verify/{student_id}` |

---

## 3. Dang nhap Admin

### POST `/api/auth/login`

```json
{
  "username": "admin",
  "password": "123456"
}
```

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

Frontend luu token va gui trong header cua moi API Admin:

```http
Authorization: Bearer <access_token>
```

Neu backend tra `401`, frontend xoa token va chuyen nguoi dung ve `/login`.

---

## 4. Dashboard va quan ly sinh vien

Tat ca API trong muc nay can JWT token.

### GET `/api/admin/stats`

Lay so lieu dashboard.

```json
{
  "total_students": 2,
  "graduated_students": 2,
  "not_graduated_students": 0,
  "pending_students": 0,
  "synced_blockchain": 2,
  "not_synced_blockchain": 0,
  "graduation_status": {
    "GRADUATED": 2
  },
  "mismatch_count": 0
}
```

### GET `/api/admin/students`

Lay danh sach sinh vien.

| Query | Mo ta |
|---|---|
| `page` | Trang hien tai, mac dinh `1` |
| `page_size` | So dong moi trang, mac dinh `20`, toi da `100` |
| `search` | Tim theo MSSV hoac ho ten |
| `graduation_status` | `GRADUATED`, `NOT_GRADUATED`, `PENDING` |

Vi du:

```http
GET /api/admin/students?search=SVFAB012&page=1&page_size=20
```

### POST `/api/admin/students`

Admin tao sinh vien chinh thuc cua truong.

```text
Tao student
-> Tao hash
-> Ghi Fabric thanh cong
-> Luu MySQL
-> approval_status = APPROVED
```

Request mau:

```json
{
  "student_id": "SVFAB012",
  "full_name": "FastAPI Fabric Integration Test",
  "date_of_birth": "2002-05-10",
  "citizen_id_hash": "hash_cccd_64_ky_tu",
  "email": "svfab012@fpt.edu.vn",
  "institution_code": "FPTU",
  "institution_name": "FPT University",
  "faculty_name": "Information Technology",
  "major": "Software Engineering",
  "training_mode": "Full-time",
  "degree_id": "DEGREEFAB012",
  "degree_type": "Bachelor",
  "graduation_status": "GRADUATED",
  "graduation_date": "2026-06-01",
  "graduation_year": 2026,
  "classification": "Good",
  "gpa": 3.5,
  "entrance_year": 2022
}
```

### GET `/api/admin/students/{student_id}`

Lay day du thong tin sinh vien de hien trong form sua.

### PUT `/api/admin/students/{student_id}`

Cap nhat mot hoac nhieu field.

```json
{
  "gpa": 3.5,
  "classification": "Very Good"
}
```

Quy trinh cap nhat:

```text
Cap nhat student
-> Tao hash moi
-> Cap nhat Fabric thanh cong
-> Cap nhat MySQL
```

Neu Fabric loi, thay doi moi trong MySQL bi rollback.

### DELETE `/api/admin/students/{student_id}`

Xoa mem sinh vien. Du lieu van con trong MySQL voi `is_deleted = true`.

### POST `/api/admin/students/{student_id}/restore`

Khoi phuc sinh vien da xoa mem. Backend dat `is_deleted = false`.

---

## 5. Xac minh cong khai

### GET `/api/verify/{student_id}`

Nguoi dung, sinh vien hoac doanh nghiep nhap MSSV de xac minh.

```http
GET /api/verify/SVFAB012
```

Response mau:

```json
{
  "student_id": "SVFAB012",
  "full_name": "FastAPI Fabric Integration Test",
  "date_of_birth": "2002-05-10",
  "email": "svfab012@fpt.edu.vn",
  "institution_name": "FPT University",
  "faculty_name": "Information Technology",
  "major": "Software Engineering",
  "training_mode": "Full-time",
  "degree_id": "DEGREEFAB012",
  "degree_type": "Bachelor",
  "entrance_year": 2022,
  "graduation_status": "GRADUATED",
  "graduation_date": "2026-06-01",
  "graduation_year": 2026,
  "classification": "Good",
  "gpa": "3.50",
  "is_graduated": true,
  "verification_status": "Verified",
  "message": "Student data is verified on blockchain.",
  "verified_at": "2026-06-22T05:00:00Z"
}
```

### Trang thai verify

| `verification_status` | Text giao dien |
|---|---|
| `Verified` | Da xac minh hop le |
| `Mismatch` | Du lieu bi thay doi |
| `Not Registered` | Khong tim thay sinh vien |
| `Not Found` | Chua co ban ghi tren Blockchain |

### Quy tac hien thi public

Hien: ho ten, MSSV, truong, khoa, nganh, he dao tao, GPA, xep loai, nam tot nghiep, trang thai va ket qua xac minh.

Khong hien: CCCD, `citizen_id_hash`, hash MySQL, hash Fabric, `is_mismatch`, dia chi thuong tru va noi cap CCCD.

### Sinh vien chua tot nghiep

Neu:

```text
verification_status = Verified
graduation_status = NOT_GRADUATED
```

Frontend van hien nut **Xem chi tiet thong tin sinh vien**.

Trang chi tiet can hien ro:

```text
Thong tin da duoc xac minh hop le.
Sinh vien hien chua tot nghiep.
```

Khong hien nhu da tot nghiep:

```text
Ngay tot nghiep: Chua co
Xep loai tot nghiep: Chua co
Yeu cau giay xac nhan tot nghiep: Khong kha dung
```

Chi an nut Xem chi tiet khi `verification_status` la `Mismatch`, `Not Found` hoac `Not Registered`.

---

## 6. Yeu cau thong tin tu ben ngoai

### POST `/api/external-requests`

Nguoi ngoai hoac doanh nghiep gui thong tin can nha truong kiem tra.

```json
{
  "student_id": "SVEXT021",
  "full_name": "Le Minh Anh",
  "gpa": 3.2,
  "graduation_status": "GRADUATED",
  "requester_name": "Cong ty Test",
  "requester_email": "hr@company.vn",
  "requester_type": "EMPLOYER",
  "message": "Can xac nhan tot nghiep"
}
```

Trang thai ban dau la `PENDING_REVIEW`.

### GET `/api/admin/external-requests`

Admin xem danh sach yeu cau tu ben ngoai.

```http
GET /api/admin/external-requests?status=PENDING_REVIEW
```

### POST `/api/admin/external-requests/{request_id}/approve`

Admin xac nhan yeu cau hop le.

```text
Fabric commit thanh cong
-> Tao student trong MySQL
-> External request = APPROVED
-> Ghi audit log
```

### POST `/api/admin/external-requests/{request_id}/reject`

Admin tu choi yeu cau va luu ly do.

```text
PENDING_REVIEW -> REJECTED
```

---

## 7. Yeu cau giay xac nhan

Nguoi dung khong can tai khoan. Ho xac nhan email bang OTP truoc khi gui yeu cau.

### Buoc 1: POST `/api/certificate-requests/otp/send`

```json
{
  "student_id": "SVFAB012",
  "requester_email": "user@example.com"
}
```

Backend gui OTP 6 so den email cua nguoi yeu cau.

### Buoc 2: POST `/api/certificate-requests/otp/verify`

```json
{
  "student_id": "SVFAB012",
  "requester_email": "user@example.com",
  "otp_code": "123456"
}
```

Response tra token dung mot lan:

```json
{
  "message": "Email verified successfully.",
  "email_verification_token": "token_xac_nhan_email",
  "expires_at": "2026-06-22T..."
}
```

### Buoc 3: POST `/api/certificate-requests`

```json
{
  "student_id": "SVFAB012",
  "requester_name": "Nguyen Thi C",
  "requester_email": "user@example.com",
  "reason": "Can giay xac nhan tot nghiep de bo sung ho so tuyen dung.",
  "email_verification_token": "token_xac_nhan_email"
}
```

Trang thai ban dau la `CERTIFICATE_PENDING`.

### GET `/api/admin/certificate-requests`

Admin xem danh sach yeu cau giay.

```http
GET /api/admin/certificate-requests?status=CERTIFICATE_PENDING
```

### POST `/api/admin/certificate-requests/{request_id}/approve`

```json
{
  "admin_note": "Yeu cau hop le. Vui long mang CCCD goc den Phong Dao Tao trong gio hanh chinh de nhan giay xac nhan."
}
```

Ket qua:

```text
CERTIFICATE_PENDING -> CERTIFICATE_APPROVED
```

Backend gui email thong bao cho nguoi yeu cau.

### POST `/api/admin/certificate-requests/{request_id}/reject`

```json
{
  "reject_reason": "Thong tin yeu cau chua day du. Vui long bo sung va gui lai."
}
```

Ket qua:

```text
CERTIFICATE_PENDING -> CERTIFICATE_REJECTED
```

Backend gui email kem ly do tu choi.

### GET `/api/admin/certificate-requests/{request_id}/print-data`

Chi Admin duoc goi API nay.

API tra du lieu de React tao trang in Giay xac nhan:

- Ho ten, MSSV, ngay sinh
- CCCD that, ngay cap, noi cap, dia chi thuong tru
- Truong, khoa, nganh, he dao tao
- Nam nhap hoc, GPA, xep loai, trang thai tot nghiep
- Thong tin nguoi yeu cau
- Nguoi duyet va thoi gian duyet

Frontend dung du lieu nay de render trang in. Admin bam `Ctrl + P` de in hoac luu PDF.

Khong duoc dung API `print-data` cho trang public.

---

## 8. Audit log

### GET `/api/admin/audit-logs`

Admin xem lich su thao tac.

| Query | Mo ta |
|---|---|
| `username` | Loc theo tai khoan Admin |
| `action` | Loc theo hanh dong |
| `entity_type` | `Student`, `ExternalRequest`, `CertificateRequest` |
| `search` | Tim kiem |
| `page` | Trang hien tai |
| `page_size` | So dong moi trang |

Vi du:

```http
GET /api/admin/audit-logs?action=APPROVE_CERTIFICATE_REQUEST
GET /api/admin/audit-logs?action=REJECT_CERTIFICATE_REQUEST
GET /api/admin/audit-logs?entity_type=Student
```

Action quan trong:

```text
CREATE_STUDENT
UPDATE_STUDENT
DELETE_STUDENT
RESTORE_STUDENT
APPROVE_EXTERNAL_REQUEST
REJECT_EXTERNAL_REQUEST
APPROVE_CERTIFICATE_REQUEST
REJECT_CERTIFICATE_REQUEST
VIEW_CERTIFICATE_PRINT_DATA
```

---

## 9. Loi frontend can xu ly

| HTTP | Y nghia |
|---:|---|
| `400` | OTP sai, OTP het han, request da duoc xu ly |
| `401` | JWT Admin khong hop le hoac het han |
| `404` | Khong tim thay sinh vien hoac request |
| `409` | Du lieu trung hoac thong tin private chua du de in |
| `422` | Du lieu form sai |
| `503` | Fabric hoac SMTP tam thoi khong san sang |

---

## 10. Khoi dong local

### Sau khi khoi dong lai may

```bash
docker start \
  orderer.example.com \
  couchdb0 \
  couchdb1 \
  peer0.org1.example.com \
  peer0.org2.example.com
```

Kiem tra:

```bash
docker ps
```

Can thay cac container Fabric va `graduation_mysql` dang chay.

### Chay Backend

```bash
cd ~/graduation-verification-system/backend
source venv/bin/activate
python3 -m uvicorn main:app --reload
```

Backend: `http://localhost:8000`

Swagger: `http://localhost:8000/docs`

### Chay Frontend React

```bash
cd ~/graduation-verification-system/frontend
npm install
npm run dev
```

Frontend Vite thuong chay tai `http://localhost:5173`.

---

## 11. Workflow tong quat

```text
Admin tao/cap nhat sinh vien
-> MySQL + Hyperledger Fabric
-> Public verify so sanh hash
-> Verified hoac Mismatch

Nguoi dung gui yeu cau giay
-> Email OTP
-> Tao certificate request
-> Admin duyet hoac tu choi
-> Backend gui email thong bao
-> Admin lay print-data
-> React tao trang in Giay xac nhan
```
