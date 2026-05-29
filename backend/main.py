from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fabric_client import FabricError, query_student, verify_graduation

app = FastAPI(title="Graduation Verification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(FabricError)
async def fabric_error_handler(request: Request, exc: FabricError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.message,
            },
        },
    )


@app.get("/")
def home() -> dict[str, str]:
    return {"message": "Graduation Verification API"}


@app.get("/api/students/{student_id}")
def get_student(student_id: str) -> dict:
    student = query_student(student_id)

    return {
        "success": True,
        "data": student,
    }

@app.get("/api/students/{student_id}/verify")
def verify_student_graduation(student_id: str) -> dict:
    verification = verify_graduation(student_id)

    return {
        "success": True,
        "data": verification,
    }