import json
import subprocess
import sys
from pathlib import Path
from typing import Any


DIGITAL_HUMAN_PIPELINE_TYPE = "stylefit-ecommerce-digital-human"

DIGITAL_HUMAN_STAGES = [
    {
        "id": "imageQuality",
        "label": "image quality and consent gate",
        "purpose": "Reject blurry, low-resolution, occluded, or non-consented input before model inference.",
    },
    {
        "id": "portraitMatting",
        "label": "human matting and parsing",
        "purpose": "Segment body, face, hair, hands, and visible garments for downstream reconstruction.",
    },
    {
        "id": "bodyLandmarks",
        "label": "2D and dense body landmarks",
        "purpose": "Estimate body pose, dense correspondences, and camera parameters from the photo.",
    },
    {
        "id": "bodyShapeFit",
        "label": "SMPL-X compatible body fitting",
        "purpose": "Fit height, weight, pose, and body shape parameters for try-on-grade proportions.",
    },
    {
        "id": "faceIdentity",
        "label": "face identity and expression fitting",
        "purpose": "Preserve user identity with a face encoder, blendshape fitting, and geometry detail.",
    },
    {
        "id": "hairReconstruction",
        "label": "hair volume reconstruction",
        "purpose": "Generate a stable hair mesh or cards instead of painting hair onto the head.",
    },
    {
        "id": "garmentAndMaterial",
        "label": "visible garment and material reconstruction",
        "purpose": "Estimate garment layers, cloth silhouette, material texture, and fit anchors.",
    },
    {
        "id": "neuralTextureBake",
        "label": "photoreal texture baking",
        "purpose": "Bake face, skin, hair, and garment textures with PBR-friendly material outputs.",
    },
    {
        "id": "rigAndRetarget",
        "label": "avatar rigging and retargeting",
        "purpose": "Export a controllable rig that can support poses, product display, and try-on.",
    },
    {
        "id": "assetExport",
        "label": "GLB and USDZ export",
        "purpose": "Write mobile-ready GLB/USDZ assets with texture compression and LOD metadata.",
    },
]


class DigitalHumanPipelineError(RuntimeError):
    pass


def required_stage_ids() -> list[str]:
    return [stage["id"] for stage in DIGITAL_HUMAN_STAGES]


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]

    if isinstance(value, dict):
        return [item for item in value.values() if isinstance(item, str)]

    return []


def _stage_files(stage_config: dict[str, Any]) -> list[str]:
    files = []
    files.extend(_as_list(stage_config.get("runner")))
    files.extend(_as_list(stage_config.get("weights")))
    files.extend(_as_list(stage_config.get("assets")))
    files.extend(_as_list(stage_config.get("config")))
    return files


def load_manifest(manifest_path: Path) -> dict[str, Any]:
    with manifest_path.open("r", encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def evaluate_readiness(manifest: dict[str, Any] | None, model_dir: Path) -> dict[str, Any]:
    missing_stages = []
    missing_files = []
    blocked_reasons = []

    if not manifest:
        return {
            "ready": False,
            "pipelineType": DIGITAL_HUMAN_PIPELINE_TYPE,
            "missingStages": required_stage_ids(),
            "missingFiles": [],
            "blockedReasons": ["workers/stylefit_avatar/models/manifest.json is missing."],
            "requiredStages": DIGITAL_HUMAN_STAGES,
        }

    if manifest.get("pipelineType") != DIGITAL_HUMAN_PIPELINE_TYPE:
        blocked_reasons.append(f"manifest.pipelineType must be {DIGITAL_HUMAN_PIPELINE_TYPE}.")

    if manifest.get("allowProductionUse") is not True:
        blocked_reasons.append("manifest.allowProductionUse must be true after legal, data, and model-quality review.")

    stages = manifest.get("stages") or {}
    for stage in DIGITAL_HUMAN_STAGES:
        stage_id = stage["id"]
        stage_config = stages.get(stage_id)

        if not isinstance(stage_config, dict):
            missing_stages.append(stage_id)
            continue

        runner = stage_config.get("runner")
        if not runner:
            missing_files.append(f"{stage_id}: runner is not configured")

        for relative_file in _stage_files(stage_config):
            if not (model_dir / relative_file).exists():
                missing_files.append(f"{stage_id}: {relative_file}")

    ready = not missing_stages and not missing_files and not blocked_reasons
    return {
        "ready": ready,
        "pipelineType": manifest.get("pipelineType", DIGITAL_HUMAN_PIPELINE_TYPE),
        "version": manifest.get("version"),
        "qualityGates": manifest.get("qualityGates", {}),
        "missingStages": missing_stages,
        "missingFiles": missing_files,
        "blockedReasons": blocked_reasons,
        "requiredStages": DIGITAL_HUMAN_STAGES,
    }


def format_readiness_error(readiness: dict[str, Any]) -> str:
    details = []

    if readiness.get("blockedReasons"):
        details.append("blocked: " + "; ".join(readiness["blockedReasons"]))

    if readiness.get("missingStages"):
        details.append("missing stages: " + ", ".join(readiness["missingStages"]))

    if readiness.get("missingFiles"):
        details.append("missing files: " + ", ".join(readiness["missingFiles"][:12]))

    return (
        "StyleFit AI Digital Human production bundle is not ready. "
        "The ecommerce-grade digital human path requires local self-trained or license-cleared runners, "
        "weights, and quality gates before returning avatarModelUri. "
        + " | ".join(details)
    )


def _build_stage_command(stage_config: dict[str, Any], runner_path: Path, context_path: Path) -> list[str]:
    command = stage_config.get("command")

    if isinstance(command, list) and command:
        return [str(part).replace("{context}", str(context_path)) for part in command]

    if runner_path.suffix == ".py":
        return [sys.executable, str(runner_path), "--context", str(context_path)]

    return [str(runner_path), "--context", str(context_path)]


def run_manifest_pipeline(manifest: dict[str, Any], model_dir: Path, output_dir: Path, public_model_base_url: str, job_id: str, image_path: Path, profile: dict[str, Any]) -> dict[str, Any]:
    job_dir = output_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    profile_path = job_dir / "profile.json"
    context_path = job_dir / "context.json"
    profile_path.write_text(json.dumps(profile or {}, ensure_ascii=False, indent=2), encoding="utf-8")

    context = {
        "jobId": job_id,
        "inputImage": str(image_path),
        "profileJson": str(profile_path),
        "jobDir": str(job_dir),
        "modelDir": str(model_dir),
        "expectedAvatarGlb": str(job_dir / "avatar.glb"),
        "stageReports": [],
    }
    stages = manifest.get("stages") or {}

    for stage in DIGITAL_HUMAN_STAGES:
        stage_id = stage["id"]
        stage_config = stages[stage_id]
        runner_path = model_dir / stage_config["runner"]
        context["currentStage"] = stage_id
        context_path.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")
        completed = subprocess.run(
            _build_stage_command(stage_config, runner_path, context_path),
            cwd=model_dir,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise DigitalHumanPipelineError(
                f"Digital human stage {stage_id} failed with exit code {completed.returncode}: {completed.stderr.strip() or completed.stdout.strip()}"
            )

        context["stageReports"].append({"stage": stage_id, "stdout": completed.stdout.strip()[-1200:]})

    avatar_path = job_dir / "avatar.glb"
    if not avatar_path.exists():
        raise DigitalHumanPipelineError("Digital human pipeline completed but did not produce avatar.glb.")

    return {
        "status": "ready",
        "jobId": job_id,
        "avatarModelUri": f"{public_model_base_url}/{job_id}/avatar.glb",
        "faceTextureUri": f"{public_model_base_url}/{job_id}/face.png" if (job_dir / "face.png").exists() else None,
        "rig": manifest.get("rig", "smplx"),
        "provenance": "stylefit-digital-human",
        "digitalHuman": {
            "pipelineType": DIGITAL_HUMAN_PIPELINE_TYPE,
            "version": manifest.get("version"),
            "qualityGates": manifest.get("qualityGates", {}),
            "stageReports": context["stageReports"],
        },
    }