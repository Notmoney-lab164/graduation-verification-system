from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

students = {
    "SV001": {
        "studentId": "SV001",
        "fullName": "Nguyen Van A",
        "major": "Software Engineering",
        "status": "GRADUATED",
        "graduationDate": "2026-05-20",
    },
    "SV002": {
        "studentId": "SV002",
        "fullName": "Tran Thi B",
        "major": "Information Assurance",
        "status": "NOT_GRADUATED",
        "graduationDate": None,
    },
}


@app.get("/")
def home():
    return {"message": "Graduation Verification API"}


@app.get("/api/students/{student_id}")
def get_student(student_id: str):
    student = students.get(student_id.upper())

    if not student:
        return {
            "studentId": student_id,
            "status": "NOT_FOUND",
            "message": "Không tìm thấy sinh viên",
        }

    return student