from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

import crud
from services.encryption_service import decrypt_value


logger = logging.getLogger(__name__)


def send_email(
    db: Session,
    to_email: str,
    subject: str,
    body: str,
    reply_to: str | None = None,
) -> None:
    email_setting = crud.get_active_email_setting(db)

    if email_setting is None:
        raise RuntimeError("Active email setting is not configured")

    smtp_password = decrypt_value(email_setting.smtp_password_encrypted)

    if not smtp_password:
        raise RuntimeError("SMTP password is empty")

    message = EmailMessage()
    message["From"] = (
        f"{email_setting.smtp_from_name} "
        f"<{email_setting.smtp_from_email}>"
    )
    message["To"] = to_email
    message["Subject"] = subject

    if reply_to:
        message["Reply-To"] = reply_to

    message.set_content(body)

    with smtplib.SMTP(
        email_setting.smtp_host,
        email_setting.smtp_port,
        timeout=20,
    ) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(
            email_setting.smtp_username,
            smtp_password,
        )
        server.send_message(message)

    logger.info("Email sent to %s", to_email)


def notify_admins_new_certificate_request(
    db: Session,
    request_id: int,
    student_id: str,
    requester_name: str,
    requester_email: str,
) -> None:
    admin_emails = crud.list_active_admin_emails(db)

    if not admin_emails:
        raise RuntimeError("No active admin email found")

    for admin_email in admin_emails:
        send_email(
            db=db,
            to_email=admin_email,
            subject=f"Yêu cầu cấp giấy xác nhận tốt nghiệp #{request_id}",
            body=(
                "Có một yêu cầu cấp giấy xác nhận tốt nghiệp mới.\n\n"
                f"Mã yêu cầu: {request_id}\n"
                f"Mã số sinh viên: {student_id}\n"
                f"Người yêu cầu: {requester_name}\n"
                f"Email người yêu cầu: {requester_email}\n\n"
                "Vui lòng đăng nhập trang quản trị để kiểm tra và xử lý yêu cầu."
            ),
            reply_to=requester_email,
        )


def notify_requester_certificate_approved(
    db: Session,
    requester_email: str,
    student_id: str,
    admin_note: str | None,
) -> None:
    note = admin_note or (
        "Yêu cầu của bạn đã được duyệt. "
        "Vui lòng liên hệ phòng đào tạo để nhận giấy xác nhận tốt nghiệp."
    )

    send_email(
        db=db,
        to_email=requester_email,
        subject="Yêu cầu cấp giấy xác nhận tốt nghiệp đã được duyệt",
        body=(
            "Yêu cầu cấp giấy xác nhận tốt nghiệp của bạn đã được duyệt.\n\n"
            f"Mã số sinh viên: {student_id}\n"
            f"Hướng dẫn từ admin: {note}\n"
        ),
    )


def notify_requester_certificate_rejected(
    db: Session,
    requester_email: str,
    student_id: str,
    reject_reason: str,
) -> None:
    send_email(
        db=db,
        to_email=requester_email,
        subject="Yêu cầu cấp giấy xác nhận tốt nghiệp đã bị từ chối",
        body=(
            "Yêu cầu cấp giấy xác nhận tốt nghiệp của bạn đã bị từ chối.\n\n"
            f"Mã số sinh viên: {student_id}\n"
            f"Lý do từ chối: {reject_reason}\n"
        ),
    )


def send_certificate_request_otp_email(
    db: Session,
    to_email: str,
    student_id: str,
    otp_code: str,
) -> None:
    subject = "Mã OTP xác thực yêu cầu cấp giấy xác nhận tốt nghiệp"

    body = (
        "Xin chào,\n\n"
        "Bạn đang thực hiện yêu cầu cấp giấy xác nhận tốt nghiệp.\n\n"
        f"Mã số sinh viên: {student_id}\n"
        f"Mã OTP của bạn là: {otp_code}\n\n"
        "Mã OTP này chỉ dùng để xác thực yêu cầu cấp giấy xác nhận tốt nghiệp. "
        "Vui lòng không chia sẻ mã này cho người khác.\n\n"
        "Trân trọng,\n"
        "Hệ thống xác minh tốt nghiệp"
    )

    send_email(
        db=db,
        to_email=to_email,
        subject=subject,
        body=body,
    )
