# StyleFit Avatar Worker

This is the self-developed AI digital human service boundary for StyleFit.

It does not call paid image-to-3D APIs. It also does not generate fake avatars when the model bundle is missing. The worker accepts a user photo, stores an auditable job, runs the owned ecommerce digital-human pipeline, and returns `avatarModelUri` only after a real GLB is exported.

For local engineering, `STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1` enables a self-authored parametric GLB exporter. That output is only a development baseline for validating upload, job polling, GLB hosting, and rendering; the app labels it as non-identity reconstruction and it must not be presented as a real user avatar.

For the product MVP, `STYLEFIT_AVATAR_ENABLE_PARAMETRIC_MVP=1` enables a self-hosted parametric digital-human generator. It assembles a mobile-ready GLB from profile measurements, preferred colors, gender presentation, and fit preference. This is the recommended low-cost preview mode until production identity/body/texture models are trained.

The parametric MVP can also use a local preview asset bundle before the full production model bundle exists. Set `STYLEFIT_AVATAR_PARAMETRIC_BUNDLE_MANIFEST` to a `parametric_manifest.json` that points to owned or commercially cleared GLB mannequins. When that bundle is ready, the worker copies the matching gender/default GLB into the job output; when it is missing or not approved, the worker falls back to the self-authored procedural mannequin.

## Production Pipeline

1. Image quality and consent checks
2. Human matting and portrait parsing
3. 2D keypoints, dense pose, and camera estimation
4. SMPL-X compatible body fitting
5. Face identity, expression, and geometry detail fitting
6. Hair volume or hair-card reconstruction
7. Visible garment and material estimation
8. Neural/PBR texture baking
9. Rigging and retargeting
10. GLB/USDZ export

## Run

```bash
python -m venv .venv-stylefit-avatar
source .venv-stylefit-avatar/bin/activate
pip install -r workers/stylefit_avatar/requirements.txt
npm run reconstruction:worker:stylefit
```

The Node API should run separately:

```bash
AVATAR_RECONSTRUCTION_PROVIDER=stylefit \
STYLEFIT_AVATAR_WORKER_URL=http://localhost:8791 \
STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=0 \
PORT=8787 npm run reconstruction:api
```

To validate the self-developed GLB pipe without trained weights:

```bash
STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1 npm run reconstruction:worker:stylefit
```

To run the recommended self-hosted MVP:

```bash
npm run reconstruction:worker:stylefit:parametric
```

## Parametric Preview Bundle

Use this path to upgrade the product preview from procedural geometry to polished local GLB assets without changing the app or the Reconstruction API.

For a runnable local bundle immediately:

```bash
npm run reconstruction:bundle:bootstrap
```

This writes self-authored bootstrap GLBs to `workers/stylefit_avatar/models/mannequins/` and creates `workers/stylefit_avatar/models/parametric_manifest.json`. It creates base assets plus gender/fit variants such as `female:regular`, `female:relaxed`, and `male:tailored`. The command skips existing files unless you run the Python module with `--overwrite`, so future high-quality assets are not accidentally replaced.

To replace the bootstrap assets with higher quality local models:

1. Put owned or license-cleared GLB mannequins under `workers/stylefit_avatar/models/mannequins/`.
2. Update `variants`, `baseMeshes`, or `baseAvatarGlb` in `workers/stylefit_avatar/models/parametric_manifest.json`.
3. Set `allowCommercialPreviewUse=true` only after asset license and quality review.
4. Start `npm run reconstruction:worker:stylefit:parametric`.

If you prefer to create the manifest manually, copy `workers/stylefit_avatar/parametric_manifest.example.json` to `workers/stylefit_avatar/models/parametric_manifest.json` first.

This bundle is still a non-identity preview. It is useful for product demos and low-cost self-hosted operation, but it does not replace the production identity/body/texture pipeline.

## Model Bundle

Create `workers/stylefit_avatar/models/manifest.json` from `model_manifest.example.json` after the model weights, runners, priors, configs, and datasets have been trained or license-cleared. Keep `allowProductionUse=false` until legal, data, and model-quality review is complete.

For App Store production, do not use research-only weights or datasets whose consent scope does not permit commercial virtual try-on.

The worker validates every required stage in `manifest.json`. Missing runners, weights, configs, priors, production permission, or quality gates block output instead of returning a low-quality fake digital human.
