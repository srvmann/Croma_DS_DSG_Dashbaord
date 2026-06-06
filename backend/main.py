import os
import shutil

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from parser import analyze_sheet, get_sheet_data, get_sheets

app = FastAPI(title="StoreWise API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

_uploaded_file: str | None = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    global _uploaded_file
    if not file.filename or not (
        file.filename.endswith(".xlsx") or file.filename.endswith(".xls")
    ):
        raise HTTPException(
            status_code=400, detail="Only .xlsx / .xls files are supported"
        )

    dest = os.path.join(DATA_DIR, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _uploaded_file = dest
    sheets = get_sheets(dest)
    return {"filename": file.filename, "sheets": sheets}


@app.get("/api/sheets")
def list_sheets():
    if not _uploaded_file:
        raise HTTPException(status_code=404, detail="No file uploaded yet")
    return {"sheets": get_sheets(_uploaded_file)}


@app.get("/api/data/{sheet_name}")
def fetch_sheet(sheet_name: str):
    if not _uploaded_file:
        raise HTTPException(status_code=404, detail="No file uploaded yet")
    return get_sheet_data(_uploaded_file, sheet_name)


@app.get("/api/analysis/{sheet_name}")
def fetch_analysis(sheet_name: str):
    if not _uploaded_file:
        raise HTTPException(status_code=404, detail="No file uploaded yet")
    return analyze_sheet(_uploaded_file, sheet_name)
