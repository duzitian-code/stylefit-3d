# Self-Hosted Deployment

StyleFit should keep the app connected only to the StyleFit Reconstruction API. The API can route to local workers, cloud GPU workers, or future proprietary model bundles without changing the mobile app.

## Local Parametric MVP

Run the app, the API, and the parametric digital-human worker:

```bash
npm run web
npm run reconstruction:worker:stylefit:parametric
PORT=8787 AVATAR_RECONSTRUCTION_PROVIDER=stylefit STYLEFIT_AVATAR_WORKER_URL=http://localhost:8791 npm run reconstruction:api
```

The worker returns `provenance: "stylefit-parametric-digital-human"`. This is the low-cost product preview mode, not a photo-identical production model.

To use polished local mannequin assets instead of the procedural fallback, configure a parametric preview bundle:

```bash
npm run reconstruction:bundle:bootstrap

# Or create the manifest manually:
cp workers/stylefit_avatar/parametric_manifest.example.json workers/stylefit_avatar/models/parametric_manifest.json
```

Then place commercially cleared GLB files under `workers/stylefit_avatar/models/mannequins/`, update `variants` or `baseMeshes`, and set `allowCommercialPreviewUse=true` after review. The bootstrap command creates self-authored starter GLBs for gender and fit-preference variants; replacing those files with polished owned assets is the intended upgrade path. The app and API stay unchanged.

## Docker Compose

```bash
docker compose -f deploy/docker-compose.selfhosted.yml up --build
```

This starts:

- `reconstruction-api` on `http://localhost:8787`
- `stylefit-avatar-worker` on `http://localhost:8791`
- a named volume for generated GLB files

## Cloud Layout

- Run `reconstruction-api` as a small CPU service.
- Run `stylefit-avatar-worker` as a CPU service for parametric MVP mode.
- Mount `workers/stylefit_avatar/models/` or an equivalent volume if using a parametric preview bundle or production model bundle.
- Add GPU workers later for TRELLIS/Hunyuan-style garment or product generation.
- Store generated assets in S3-compatible object storage and return signed or CDN URLs as `avatarModelUri` / `garmentModelUri`.
- Cache generated avatars until the user deletes or regenerates them.

## Garment Asset Rules

- Built-in wardrobe items use self-authored procedural preview layers and can run fully offline.
- Production garments should be generated or imported by a Garment Service and returned as `garmentModelUri` / `garmentTextureUri`.
- Keep a manifest for owned or licensed garment GLBs with category, attachment region, unit scale, triangle count, material names, and commercial-use status.
- Do not mark a garment production-ready if it only has `stylefit-procedural-preview`; that layer is for MVP try-on visualization and failure fallback.

## Production Rules

- Never let the mobile app call model providers directly.
- Keep all providers behind `server/reconstruction-api.mjs`.
- Production identity digital humans must come from a local model bundle validated by `workers/stylefit_avatar/digital_human.py`.
- Non-commercial research weights must not be shipped unless a commercial license is obtained.