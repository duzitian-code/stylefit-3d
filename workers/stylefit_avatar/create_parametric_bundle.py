import argparse
import json
from pathlib import Path
from typing import Any

from .parametric_avatar import create_parametric_digital_human_glb
from .parametric_bundle import PARAMETRIC_BUNDLE_PIPELINE_TYPE, evaluate_parametric_bundle


BUNDLE_VERSION = "0.3.1-self-authored-mannequin"

BASE_PROFILE_PRESETS: dict[str, dict[str, Any]] = {
    "female": {
        "gender": "female",
        "heightCm": 168,
        "weightKg": 58,
        "fitPreference": "regular",
        "preferredColors": ["#2D6F8E", "#D0A85C"],
    },
    "male": {
        "gender": "male",
        "heightCm": 178,
        "weightKg": 76,
        "fitPreference": "regular",
        "preferredColors": ["#2F4858", "#A6A57A"],
    },
    "nonBinary": {
        "gender": "nonBinary",
        "heightCm": 172,
        "weightKg": 64,
        "fitPreference": "tailored",
        "preferredColors": ["#4C6F66", "#C4A15A"],
    },
    "default": {
        "gender": "nonBinary",
        "heightCm": 170,
        "weightKg": 62,
        "fitPreference": "regular",
        "preferredColors": ["#4F6D7A", "#D1B36A"],
    },
}

FIT_PRESETS: dict[str, dict[str, Any]] = {
    "relaxed": {
        "fitPreference": "relaxed",
    },
    "regular": {
        "fitPreference": "regular",
    },
    "tailored": {
        "fitPreference": "tailored",
    },
}


def _base_meshes() -> dict[str, str]:
    return {asset_key: f"mannequins/{asset_key}.glb" for asset_key in BASE_PROFILE_PRESETS}


def _variant_meshes() -> dict[str, str]:
    return {
        f"{asset_key}:{fit_key}": f"mannequins/{asset_key}-{fit_key}.glb"
        for asset_key in BASE_PROFILE_PRESETS
        for fit_key in FIT_PRESETS
    }


def _manifest_document() -> dict[str, Any]:
    return {
        "pipelineType": PARAMETRIC_BUNDLE_PIPELINE_TYPE,
        "version": BUNDLE_VERSION,
        "allowCommercialPreviewUse": True,
        "baseAvatarGlb": "mannequins/default.glb",
        "baseMeshes": _base_meshes(),
        "variants": _variant_meshes(),
        "qualityGates": {
            "assetLicense": "stylefit-self-authored-procedural-mannequin",
            "identityMode": "non-identity-preview-mannequin",
            "requiresCommercialConsent": True,
            "variantStrategy": "gender-plus-fit-preference",
            "replacementContract": "Drop owned or commercially cleared GLB mannequins into the same paths to upgrade visual quality.",
        },
    }


def _merge_manifest(existing: dict[str, Any], document: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    changed = False
    merged = dict(existing)

    for key, value in document.items():
        if key in {"baseMeshes", "variants", "qualityGates"}:
            current_value = merged.get(key)
            if not isinstance(current_value, dict):
                merged[key] = value
                changed = True
                continue

            for child_key, child_value in value.items():
                if child_key not in current_value:
                    current_value[child_key] = child_value
                    changed = True
            continue

        if key not in merged:
            merged[key] = value
            changed = True

    if merged.get("version") == "0.1.0-bootstrap":
        merged["version"] = BUNDLE_VERSION
        changed = True

    return merged, changed


def _write_manifest(path: Path, document: dict[str, Any], overwrite: bool) -> bool:
    next_document = document
    should_write = overwrite or not path.exists()

    if path.exists() and not overwrite:
        try:
            existing_document = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return False

        next_document, changed = _merge_manifest(existing_document, document)
        should_write = changed

    if not should_write:
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(next_document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return True


def bootstrap_parametric_bundle(model_dir: Path, overwrite: bool = False) -> dict[str, Any]:
    mannequin_dir = model_dir / "mannequins"
    manifest_path = model_dir / "parametric_manifest.json"
    written_assets = []
    skipped_assets = []

    for asset_key, profile in BASE_PROFILE_PRESETS.items():
        output_path = mannequin_dir / f"{asset_key}.glb"
        if output_path.exists() and not overwrite:
            skipped_assets.append(str(output_path))
            continue

        create_parametric_digital_human_glb(output_path, profile)
        written_assets.append(str(output_path))

    for asset_key, profile in BASE_PROFILE_PRESETS.items():
        for fit_key, fit_profile in FIT_PRESETS.items():
            output_path = mannequin_dir / f"{asset_key}-{fit_key}.glb"
            if output_path.exists() and not overwrite:
                skipped_assets.append(str(output_path))
                continue

            create_parametric_digital_human_glb(output_path, {**profile, **fit_profile})
            written_assets.append(str(output_path))

    manifest_written = _write_manifest(manifest_path, _manifest_document(), overwrite)
    readiness = evaluate_parametric_bundle(manifest_path)
    return {
        "modelDir": str(model_dir),
        "manifestPath": str(manifest_path),
        "manifestWritten": manifest_written,
        "writtenAssets": written_assets,
        "skippedAssets": skipped_assets,
        "readiness": readiness,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Create StyleFit Parametric Preview Bundle v1 assets.")
    parser.add_argument("--model-dir", default="workers/stylefit_avatar/models", help="Directory where the bundle manifest and mannequin GLBs will be written.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing generated GLBs and parametric_manifest.json.")
    args = parser.parse_args()

    result = bootstrap_parametric_bundle(Path(args.model_dir), overwrite=args.overwrite)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()