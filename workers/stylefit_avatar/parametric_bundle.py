import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PARAMETRIC_BUNDLE_PIPELINE_TYPE = "stylefit-parametric-preview-bundle"


@dataclass
class ParametricBundleSelection:
    source_path: Path
    asset_key: str
    version: str | None
    quality_gates: dict[str, Any]


def _load_manifest(manifest_path: Path) -> dict[str, Any]:
    with manifest_path.open("r", encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def _asset_candidates(profile: dict[str, Any]) -> list[str]:
    gender = profile.get("gender")
    fit_preference = profile.get("fitPreference")

    if gender == "female":
        gender_candidates = ["female", "default", "neutral", "nonBinary"]
    elif gender == "male":
        gender_candidates = ["male", "default", "neutral", "nonBinary"]
    elif gender == "nonBinary":
        gender_candidates = ["nonBinary", "neutral", "default"]
    else:
        gender_candidates = ["default", "neutral", "female", "male"]

    if fit_preference in {"relaxed", "regular", "tailored"}:
        fit_candidates = [fit_preference, "regular", "default"]
    else:
        fit_candidates = ["regular", "default"]

    candidates = []
    for gender_key in gender_candidates:
        for fit_key in fit_candidates:
            candidates.append(f"{gender_key}:{fit_key}")
            candidates.append(f"{gender_key}-{fit_key}")
        candidates.append(gender_key)

    return list(dict.fromkeys([*candidates, "default"]))


def _bundle_assets(manifest: dict[str, Any]) -> dict[str, str]:
    assets = {}
    variants = manifest.get("variants")
    if isinstance(variants, dict):
        assets.update({key: value for key, value in variants.items() if isinstance(key, str) and isinstance(value, str)})

    base_meshes = manifest.get("baseMeshes")
    if isinstance(base_meshes, dict):
        assets.update({key: value for key, value in base_meshes.items() if isinstance(key, str) and isinstance(value, str)})

    base_avatar = manifest.get("baseAvatarGlb")
    if isinstance(base_avatar, str):
        assets.setdefault("default", base_avatar)

    return assets


def evaluate_parametric_bundle(manifest_path: Path | None) -> dict[str, Any]:
    if not manifest_path:
        return {"configured": False, "ready": False, "blockedReasons": ["STYLEFIT_AVATAR_PARAMETRIC_BUNDLE_MANIFEST is not configured."]}

    if not manifest_path.exists():
        return {
            "configured": False,
            "ready": False,
            "manifestPath": str(manifest_path),
            "blockedReasons": [f"{manifest_path} is missing."],
        }

    try:
        manifest = _load_manifest(manifest_path)
    except json.JSONDecodeError as error:
        return {
            "configured": True,
            "ready": False,
            "manifestPath": str(manifest_path),
            "blockedReasons": [f"manifest JSON is invalid: {error.msg}"],
        }

    blocked_reasons = []
    missing_files = []

    if manifest.get("pipelineType") != PARAMETRIC_BUNDLE_PIPELINE_TYPE:
        blocked_reasons.append(f"manifest.pipelineType must be {PARAMETRIC_BUNDLE_PIPELINE_TYPE}.")

    if manifest.get("allowCommercialPreviewUse") is not True:
        blocked_reasons.append("manifest.allowCommercialPreviewUse must be true after asset license and quality review.")

    assets = _bundle_assets(manifest)
    if not assets:
        blocked_reasons.append("manifest must define baseAvatarGlb or baseMeshes.")

    for asset_key, relative_path in assets.items():
        if not relative_path.endswith(".glb"):
            missing_files.append(f"{asset_key}: {relative_path} is not a .glb asset")
            continue

        if not (manifest_path.parent / relative_path).exists():
            missing_files.append(f"{asset_key}: {relative_path}")

    return {
        "configured": True,
        "ready": not blocked_reasons and not missing_files,
        "manifestPath": str(manifest_path),
        "pipelineType": manifest.get("pipelineType", PARAMETRIC_BUNDLE_PIPELINE_TYPE),
        "version": manifest.get("version"),
        "availableAssets": sorted(assets.keys()),
        "missingFiles": missing_files,
        "blockedReasons": blocked_reasons,
        "qualityGates": manifest.get("qualityGates", {}),
    }


def select_parametric_bundle_asset(manifest_path: Path | None, profile: dict[str, Any]) -> ParametricBundleSelection | None:
    if not manifest_path or not evaluate_parametric_bundle(manifest_path).get("ready"):
        return None

    manifest = _load_manifest(manifest_path)
    assets = _bundle_assets(manifest)
    for asset_key in _asset_candidates(profile or {}):
        relative_path = assets.get(asset_key)
        if relative_path:
            return ParametricBundleSelection(
                source_path=manifest_path.parent / relative_path,
                asset_key=asset_key,
                version=manifest.get("version"),
                quality_gates=manifest.get("qualityGates", {}),
            )

    return None


def copy_parametric_bundle_avatar(manifest_path: Path | None, profile: dict[str, Any], output_path: Path) -> dict[str, Any] | None:
    selection = select_parametric_bundle_asset(manifest_path, profile)
    if not selection:
        return None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(selection.source_path, output_path)
    return {
        "assetSource": "local-parametric-preview-bundle",
        "assetKey": selection.asset_key,
        "version": selection.version,
        "qualityGates": selection.quality_gates,
    }