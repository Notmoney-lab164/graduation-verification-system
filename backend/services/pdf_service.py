from datetime import datetime
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def _draw_line(pdf, y):
    pdf.line(50, y, 545, y)


def generate_verification_pdf(student, verification: dict) -> bytes:
    buffer = BytesIO()

    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 50

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, y, "Graduation Verification Report")

    y -= 30
    _draw_line(pdf, y)

    y -= 35
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Student Information")

    pdf.setFont("Helvetica", 11)

    fields = [
        ("Student ID", student.student_id),
        ("Full Name", student.full_name),
        ("Date of Birth", student.date_of_birth),
        ("Institution", student.institution_name),
        ("Faculty", student.faculty_name),
        ("Major", student.major),
        ("Training Mode", student.training_mode),
        ("Degree ID", student.degree_id),
        ("Degree Type", student.degree_type),
        ("Graduation Status", student.graduation_status),
        ("Graduation Date", student.graduation_date),
        ("Graduation Year", student.graduation_year),
        ("Classification", student.classification),
        ("GPA", student.gpa),
        ("Total Credits", student.total_credits),
    ]

    for label, value in fields:
        y -= 20
        pdf.drawString(60, y, f"{label}: {value if value is not None else 'N/A'}")

    y -= 30
    _draw_line(pdf, y)

    y -= 35
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Blockchain Verification")

    pdf.setFont("Helvetica", 11)

    verification_fields = [
        ("Verification Status", verification.get("verification_status")),
        ("Message", verification.get("message")),
        ("MySQL Metadata Hash", student.metadata_hash),
        ("Blockchain Metadata Hash", verification.get("metadata_hash_blockchain")),
        ("Blockchain Tx ID", student.blockchain_tx_id),
    ]

    for label, value in verification_fields:
        y -= 20
        text = f"{label}: {value if value is not None else 'N/A'}"
        if len(text) > 95:
            text = text[:92] + "..."
        pdf.drawString(60, y, text)

    y -= 35
    _draw_line(pdf, y)

    y -= 25
    pdf.setFont("Helvetica", 10)
    pdf.drawString(
        50,
        y,
        f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    )

    pdf.showPage()
    pdf.save()

    buffer.seek(0)
    return buffer.getvalue()
