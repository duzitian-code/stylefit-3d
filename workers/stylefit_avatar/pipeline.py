import os
from dataclasses import dataclass
from pathlib import Path

from .baseline_glb import create_development_avatar_glb
from .digital_human import evaluate_readiness, format_readiness_error, load_manifest, run_manifest_pipeline
from .parametric_bundle import copy_parametric_bundle_avatar, evaluate_parametric_bundle
from .parametric_avatar import create_parametric_digital_human_glb, estimate_body_measurements


class ModelBundleMissing(RuntimeError):
    pass


@dataclass
class PipelineConfig:
    model_dir: Path
    output_dir: Path
    public_model_base_url: str
    enable_parametric_mvp: bool
    enable_dev_baseline: bool
    parametric_bundle_manifest: Path | None


@dataclass
class ReconstructionInput:
    job_id: str
    image_path: Path
    profile: dict


class StyleFitAvatarPipeline:
    def __init__(self, config: PipelineConfig):
        self.config = config

    @property
    def manifest_path(self) -> Path:
        return self.config.model_dir / "manifest.json"

    def health(self) -> dict:
        manifest = load_manifest(self.manifest_path) if self.manifest_path.exists() else None
        readiness = evaluate_readiness(manifest, self.config.model_dir)

        return {
            "engine": "StyleFit AI Digital Human",
            "target": "ecommerce-grade AI digital human",
            "ready": readiness["ready"] or self.config.enable_parametric_mvp or self.config.enable_dev_baseline,
            "productionReady": readiness["ready"],
            "mode": "parametric-mvp" if self.config.enable_parametric_mvp else "development-baseline" if self.config.enable_dev_baseline else "production",
            "modelDir": str(self.config.model_dir),
            "requiredManifest": str(self.manifest_path),
            "parametricDigitalHumanEnabled": self.config.enable_parametric_mvp,
            "developmentBaselineEnabled": self.config.enable_dev_baseline,
            "parametricBundle": evaluate_parametric_bundle(self.config.parametric_bundle_manifest),
            "readiness": readiness,
        }

    def _load_manifest(self) -> dict:
        return load_manifest(self.manifest_path)

    def reconstruct(self, reconstruction_input: ReconstructionInput) -> dict:
        if self.config.enable_parametric_mvp:
            model_path = self.config.output_dir / reconstruction_input.job_id / "avatar.glb"
            bundle_result = copy_parametric_bundle_avatar(self.config.parametric_bundle_manifest, reconstruction_input.profile or {}, model_path)
            if not bundle_result:
                create_parametric_digital_human_glb(model_path, reconstruction_input.profile or {})

            quality_gates = {
                "identityMode": "profile-and-measurement-parametric",
                "requiresCommercialConsent": True,
            }
            pipeline_type = "stylefit-parametric-digital-human"
            version = "0.1.0"
            if bundle_result:
                quality_gates.update(bundle_result["qualityGates"])
                quality_gates["assetSource"] = bundle_result["assetSource"]
                quality_gates["assetKey"] = bundle_result["assetKey"]
                pipeline_type = "stylefit-parametric-preview-bundle"
                version = bundle_result.get("version") or version

            return {
                "status": "ready",
                "jobId": reconstruction_input.job_id,
                "avatarModelUri": f"{self.config.public_model_base_url}/{reconstruction_input.job_id}/avatar.glb",
                "rig": "custom-rig",
                "provenance": "stylefit-parametric-digital-human",
                "bodyMeasurements": estimate_body_measurements(reconstruction_input.profile or {}),
                "digitalHuman": {
                    "pipelineType": pipeline_type,
                    "version": version,
                    "qualityGates": quality_gates,
                },
            }

        if self.config.enable_dev_baseline:
            model_path = self.config.output_dir / reconstruction_input.job_id / "avatar.glb"
            create_development_avatar_glb(model_path, reconstruction_input.profile or {})
            return {
                "status": "ready",
                "jobId": reconstruction_input.job_id,
                "avatarModelUri": f"{self.config.public_model_base_url}/{reconstruction_input.job_id}/avatar.glb",
                "rig": "custom-rig",
                "provenance": "stylefit-dev-baseline",
                "errorMessage": "自研开发基线模型已生成；它用于验证端到端 GLB 管线，不是身份级真人重建模型。",
            }

        manifest = self._load_manifest() if self.manifest_path.exists() else None
        readiness = evaluate_readiness(manifest, self.config.model_dir)

        if not readiness["ready"]:
            raise ModelBundleMissing(format_readiness_error(readiness))

        return run_manifest_pipeline(
            manifest,
            self.config.model_dir,
            self.config.output_dir,
            self.config.public_model_base_url,
            reconstruction_input.job_id,
            reconstruction_input.image_path,
            reconstruction_input.profile or {},
        )


def default_config() -> PipelineConfig:
    model_dir = Path(os.environ.get("STYLEFIT_AVATAR_MODEL_DIR", "./workers/stylefit_avatar/models"))
    parametric_manifest = os.environ.get("STYLEFIT_AVATAR_PARAMETRIC_BUNDLE_MANIFEST")
    return PipelineConfig(
        model_dir=model_dir,
        output_dir=Path(os.environ.get("STYLEFIT_AVATAR_OUTPUT_DIR", "/tmp/stylefit-avatar-output")),
        public_model_base_url=os.environ.get("STYLEFIT_AVATAR_PUBLIC_MODEL_BASE_URL", "http://localhost:8791/models").rstrip("/"),
        enable_parametric_mvp=os.environ.get("STYLEFIT_AVATAR_ENABLE_PARAMETRIC_MVP") == "1",
        enable_dev_baseline=os.environ.get("STYLEFIT_AVATAR_ENABLE_DEV_BASELINE") == "1",
        parametric_bundle_manifest=Path(parametric_manifest) if parametric_manifest else model_dir / "parametric_manifest.json",
    )