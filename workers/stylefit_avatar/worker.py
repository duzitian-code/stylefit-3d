import json
import mimetypes
import os
import shutil
import uuid
from pathlib import Path
from threading import Lock

from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .pipeline import ModelBundleMissing, ReconstructionInput, StyleFitAvatarPipeline, default_config


config = default_config()
config.output_dir.mkdir(parents=True, exist_ok=True)
mimetypes.add_type("model/gltf-binary", ".glb")

app = FastAPI(title="StyleFit Avatar Worker")
cors_origin = os.environ.get("CORS_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin] if cors_origin != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/models", StaticFiles(directory=config.output_dir), name="models")
pipeline = StyleFitAvatarPipeline(config)
jobs: dict[str, dict] = {}
jobs_lock = Lock()


@app.get("/health")
def health():
    return pipeline.health()


def parse_profile(profile: str | None) -> dict:
    if not profile:
        return {}

    try:
        return json.loads(profile)
    except json.JSONDecodeError:
        return {}


def set_job(job_id: str, payload: dict):
    with jobs_lock:
        jobs[job_id] = payload


def update_job(job_id: str, **updates):
    with jobs_lock:
        current = jobs.get(job_id, {"status": "failed", "jobId": job_id})
        jobs[job_id] = {**current, **updates}


def run_reconstruction_job(reconstruction_input: ReconstructionInput):
    update_job(
        reconstruction_input.job_id,
        status="processing",
        message="StyleFit AI Digital Human pipeline is processing the submitted photo.",
    )

    try:
        result = pipeline.reconstruct(reconstruction_input)
        update_job(reconstruction_input.job_id, **result)
    except ModelBundleMissing as error:
        update_job(
            reconstruction_input.job_id,
            status="failed",
            errorMessage=str(error),
        )
    except Exception as error:
        update_job(
            reconstruction_input.job_id,
            status="failed",
            errorMessage=f"StyleFit Avatar worker failed: {error}",
        )


@app.get("/avatar/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)

    if not job:
        return JSONResponse(
            status_code=404,
            content={"status": "failed", "jobId": job_id, "errorMessage": "StyleFit Avatar job was not found."},
        )

    return job


@app.post("/avatar/reconstruct")
async def reconstruct_avatar(
    background_tasks: BackgroundTasks,
    facePhoto: UploadFile = File(...),
    profile: str | None = Form(default=None),
):
    job_id = uuid.uuid4().hex
    job_dir = config.output_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / "input.jpg"

    with input_path.open("wb") as output_file:
        shutil.copyfileobj(facePhoto.file, output_file)

    reconstruction_input = ReconstructionInput(
        job_id=job_id,
        image_path=input_path,
        profile=parse_profile(profile),
    )

    set_job(
        job_id,
        {
            "status": "queued",
            "jobId": job_id,
            "pollUrl": f"/avatar/jobs/{job_id}",
            "message": "StyleFit AI Digital Human job has been queued.",
        },
    )
    background_tasks.add_task(run_reconstruction_job, reconstruction_input)

    return jobs[job_id]