import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse


TRIPOSR_REPO_DIR = Path(os.environ.get("TRIPOSR_REPO_DIR", "/opt/TripoSR"))
OUTPUT_DIR = Path(os.environ.get("TRIPOSR_OUTPUT_DIR", "/tmp/stylefit-triposr-output"))
PUBLIC_MODEL_BASE_URL = os.environ.get("PUBLIC_MODEL_BASE_URL", "http://localhost:8790/models").rstrip("/")
TRIPOSR_DEVICE = os.environ.get("TRIPOSR_DEVICE", "cuda:0")
TRIPOSR_PYTHON = os.environ.get("TRIPOSR_PYTHON", sys.executable)
MODEL_SAVE_FORMAT = os.environ.get("TRIPOSR_MODEL_SAVE_FORMAT", "glb")
MC_RESOLUTION = os.environ.get("TRIPOSR_MC_RESOLUTION", "256")

app = FastAPI(title="StyleFit TripoSR Worker")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/models", StaticFiles(directory=OUTPUT_DIR), name="models")


def triposr_run_script() -> Path:
    return TRIPOSR_REPO_DIR / "run.py"


def triposr_ready() -> bool:
    return triposr_run_script().exists()


@app.get("/health")
def health():
    return {
        "ok": triposr_ready(),
        "engine": "TripoSR",
        "license": "MIT",
        "repoDir": str(TRIPOSR_REPO_DIR),
        "outputDir": str(OUTPUT_DIR),
    }


@app.post("/avatar/reconstruct")
async def reconstruct_avatar(facePhoto: UploadFile = File(...)):
    if not triposr_ready():
        return JSONResponse(
            status_code=503,
            content={
                "status": "failed",
                "errorMessage": f"TripoSR worker is running, but {triposr_run_script()} does not exist. Clone VAST-AI-Research/TripoSR and set TRIPOSR_REPO_DIR.",
            },
        )

    job_id = uuid.uuid4().hex
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / "input.jpg"

    with input_path.open("wb") as output_file:
        shutil.copyfileobj(facePhoto.file, output_file)

    command = [
        TRIPOSR_PYTHON,
        str(triposr_run_script()),
        str(input_path),
        "--output-dir",
        str(job_dir),
        "--model-save-format",
        MODEL_SAVE_FORMAT,
        "--device",
        TRIPOSR_DEVICE,
        "--mc-resolution",
        MC_RESOLUTION,
    ]

    process = subprocess.run(
        command,
        cwd=str(TRIPOSR_REPO_DIR),
        text=True,
        capture_output=True,
        timeout=int(os.environ.get("TRIPOSR_TIMEOUT_SECONDS", "900")),
    )

    if process.returncode != 0:
        return JSONResponse(
            status_code=500,
            content={
                "status": "failed",
                "jobId": job_id,
                "errorMessage": "TripoSR reconstruction failed.",
                "stderr": process.stderr[-4000:],
                "stdout": process.stdout[-4000:],
            },
        )

    mesh_path = job_dir / "0" / f"mesh.{MODEL_SAVE_FORMAT}"

    if not mesh_path.exists():
        return JSONResponse(
            status_code=500,
            content={
                "status": "failed",
                "jobId": job_id,
                "errorMessage": f"TripoSR completed but did not produce {mesh_path}.",
                "stdout": process.stdout[-4000:],
            },
        )

    return {
        "status": "ready",
        "jobId": job_id,
        "avatarModelUri": f"{PUBLIC_MODEL_BASE_URL}/{job_id}/0/mesh.{MODEL_SAVE_FORMAT}",
        "rig": "custom-rig",
    }