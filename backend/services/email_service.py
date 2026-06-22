import logging
import os
import smtplib
from email.message import EmailMessage


logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    body: str,
) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL")
    from_name = os.getenv(
        "SMTP_FROM_NAME",
        "Graduation Verification System",
    )

    required_values = [
        smtp_host,
        smtp_username,
        smtp_password,
        from_email,
    ]

    if not all(required_values):
        raise RuntimeError("SMTP email configuration is incomplete")

    message = EmailMessage()
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(
        smtp_host,
        smtp_port,
        timeout=20,
    ) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_username, smtp_password)
        server.send_message(message)

    logger.info("Email sent to %s", to_email)


def send_certificate_request_otp(
    requester_email: str,
    student_id: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> None:
    send_email(
        to_email=requester_email,
        subject="Ma OTP xac minh yeu cau giay xac nhan",
        body=(
            "Ma OTP xac minh email cua ban la:\n\n"
            f"{otp_code}\n\n"
            f"Ma OTP co hieu luc trong {expires_in_minutes} phut.\n"
            f"Ma sinh vien: {student_id}\n\n"
            "Khong chia se ma OTP nay voi bat ky ai."
        ),
    )


def notify_admin_new_certificate_request(
    request_id: int,
    student_id: str,
    requester_name: str,
) -> None:
    admin_email = os.getenv("ADMIN_NOTIFICATION_EMAIL")

    if not admin_email:
        raise RuntimeError(
            "ADMIN_NOTIFICATION_EMAIL is not configured"
        )

    send_email(
        to_email=admin_email,
        subject=f"New certificate request #{request_id}",
        body=(
            "A new graduation certificate request was submitted.\n\n"
            f"Request ID: {request_id}\n"
            f"Student ID: {student_id}\n"
            f"Requester: {requester_name}\n\n"
            "Please open the admin dashboard to review the request."
        ),
    )


def notify_requester_certificate_approved(
    requester_email: str,
    student_id: str,
    admin_note: str | None,
) -> None:
    note = admin_note or (
        "Please bring your original citizen ID card to the "
        "Academic Affairs Office to receive the confirmation document."
    )

    send_email(
        to_email=requester_email,
        subject="Graduation certificate request approved",
        body=(
            "Your graduation certificate request has been approved.\n\n"
            f"Student ID: {student_id}\n"
            f"Thong bao tu nha truong: {note}\n"
        ),
    )


def notify_requester_certificate_rejected(
    requester_email: str,
    student_id: str,
    reject_reason: str,
) -> None:
    send_email(
        to_email=requester_email,
        subject="Graduation certificate request rejected",
        body=(
            "Your graduation certificate request was rejected.\n\n"
            f"Student ID: {student_id}\n"
            f"Reason: {reject_reason}\n"
        ),
    )