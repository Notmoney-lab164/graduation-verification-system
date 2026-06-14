import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

import models
from database import get_db

# ============================================================
# SECURITY — Xác thực và phân quyền Admin
#
# Luồng hoạt động:
#   1. Admin gửi username + password
#   2. authenticate_user() kiểm tra đúng/sai
#   3. create_access_token() tạo JWT Token
#   4. Frontend lưu token, gửi kèm mỗi request
#   5. get_current_admin() kiểm tra token hợp lệ
#      → Hợp lệ   : Cho phép vào API
#      → Không hợp lệ: Trả về 401 Unauthorized
# ============================================================

load_dotenv()

# Đọc cấu hình từ file .env
SECRET_KEY = os.getenv("SECRET_KEY")                                      # Khóa bí mật để ký JWT
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv(                              # Thời gian hết hạn token
    "ACCESS_TOKEN_EXPIRE_MINUTES", "120"                                  # Mặc định 120 phút (2 giờ)
))
ALGORITHM = "HS256"                                                        # Thuật toán mã hóa JWT

# Cấu hình bcrypt để hash mật khẩu
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Cấu hình đọc Bearer Token từ header Authorization
# Ví dụ header: Authorization: Bearer <token>
bearer_scheme = HTTPBearer()


# ============================================================
# HÀM TIỆN ÍCH — XỬ LÝ MẬT KHẨU
# ============================================================

def verify_password(plain_password: str, password_hash: str) -> bool:
    """
    Kiểm tra mật khẩu người dùng nhập có khớp với hash trong database không.

    Ví dụ:
        verify_password("123456", "$2b$12$...") → True / False
    """
    return pwd_context.verify(plain_password, password_hash)


def get_password_hash(password: str) -> str:
    """
    Hash mật khẩu thô thành chuỗi bcrypt để lưu vào database.
    Không bao giờ lưu mật khẩu thật vào database.

    Ví dụ:
        get_password_hash("123456") → "$2b$12$..."
    """
    return pwd_context.hash(password)


# ============================================================
# XÁC THỰC ĐĂNG NHẬP
# ============================================================

def authenticate_user(db: Session, username: str, password: str):
    """
    Kiểm tra thông tin đăng nhập của Admin.

    Quy trình:
        Bước 1: Tìm user theo username trong database
        Bước 2: Kiểm tra tài khoản có đang bị khóa không (is_active)
        Bước 3: Kiểm tra mật khẩu có khớp không
        Bước 4: Cập nhật last_login nếu đăng nhập thành công

    Trả về:
        User object nếu đăng nhập thành công
        None nếu sai username, sai password, hoặc tài khoản bị khóa
    """
    # Bước 1: Tìm user theo username
    user = (
        db.query(models.User)
        .filter(models.User.username == username)
        .first()
    )

    if not user:
        return None  # Username không tồn tại

    if not user.is_active:
        return None  # Tài khoản đang bị khóa

    if not verify_password(password, user.password_hash):
        return None  # Sai mật khẩu

    # Bước 4: Cập nhật thời gian đăng nhập gần nhất
    # .replace(tzinfo=None) → Bỏ timezone trước khi lưu vào MySQL
    # vì MySQL DateTime không lưu được timezone
    user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(user)

    return user


# ============================================================
# TẠO JWT TOKEN
# ============================================================

def create_access_token(data: dict):
    """
    Tạo JWT Token sau khi đăng nhập thành công.
    Token này được Frontend lưu lại và gửi kèm mỗi request đến API admin.

    Cấu trúc token:
        {
            "sub": "admin_username",   ← Tên đăng nhập
            "exp": 1234567890          ← Thời điểm hết hạn
        }

    Ví dụ:
        create_access_token({"sub": "admin"})
        → "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    """
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not configured")

    # Tính thời điểm hết hạn
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode = data.copy()
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ============================================================
# KIỂM TRA QUYỀN ADMIN
# Dùng làm Dependency trong các endpoint admin
# ============================================================

def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    Middleware kiểm tra quyền Admin cho mỗi request vào API admin.
    Được dùng như Dependency: _: bool = Depends(get_current_admin)

    Quy trình kiểm tra:
        Bước 1: Đọc Bearer Token từ header Authorization
        Bước 2: Giải mã token → Lấy username
        Bước 3: Tìm user trong database theo username
        Bước 4: Kiểm tra tài khoản còn hoạt động không
        Bước 5: Kiểm tra có đúng role "admin" không

    Kết quả:
        → Hợp lệ        : Trả về user object, cho phép vào API
        → Token lỗi     : 401 Unauthorized
        → Không phải admin: 403 Forbidden
        → SECRET_KEY lỗi: 500 Internal Server Error
    """
    if not SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SECRET_KEY is not configured",
        )

    token = credentials.credentials

    # Bước 2: Giải mã token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
    except JWTError:
        # Token sai định dạng hoặc đã hết hạn
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Bước 3 + 4: Tìm user và kiểm tra trạng thái
    user = (
        db.query(models.User)
        .filter(models.User.username == username)
        .first()
    )

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive or does not exist",
        )

    # Bước 5: Kiểm tra role admin
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    return user