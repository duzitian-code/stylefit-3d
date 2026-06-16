# Open Source Digital Human Stack

This document captures the low-cost, self-hosted path for StyleFit AI digital humans. The goal is to avoid core production dependency on paid third-party APIs while still using open-source projects where their licenses and technical boundaries fit App Store production.

## Recommendation

Use a hybrid self-hosted stack:

1. Commercial-safe perception modules for masks, landmarks, pose, and quality gates.
2. Self-hosted image-to-3D models for garments and product assets.
3. A StyleFit-owned digital-human body/face model bundle for the user avatar path.
4. GLB/VRM/USDZ export as the product contract, so the app is not coupled to one provider.

Do not make a paid external API the core avatar provider. Do not ship research-only human reconstruction weights in production.

## Candidate Projects

| Project | Useful For | License / Risk | Production Fit |
| --- | --- | --- | --- |
| MediaPipe | Pose, face landmarks, hand landmarks, mobile-friendly perception | Apache-2.0 repo; confirm model/task terms for the exact package used | Good for quality gates and landmark stages |
| Segment Anything | Promptable segmentation and masks | Apache-2.0 model; SA-1B dataset has separate research terms | Good for masks, not a full portrait parser |
| TripoSR | Fast single-image 3D reconstruction to GLB | MIT, including pretrained model per README | Good for object/garment experiments; weak for identity-preserving humans |
| TRELLIS | Higher quality image/text-to-3D assets, GLB export, training code | MIT for models and most code; check submodule licenses | Good self-hosted asset generator; needs NVIDIA GPU, not a rigged human system |
| Hunyuan3D-2 | Strong image-to-3D and texture generation, API server | Custom Tencent community license; excludes EU/UK/South Korea territory, MAU threshold, attribution/disclosure, AUP | Technically strong but legal/product review required; not lock-in-free |
| ECON / ICON / SMPL-X family | Clothed human reconstruction, SMPL-X animation | Non-commercial research or separate commercial license required | Useful reference, not production unless licensed |
| VRM / UniVRM | Avatar file format and Unity import/export | MIT implementation | Good avatar format target; not a generation model |
| Ready Player Me Visage | Web display of GLB avatars | MIT viewer; avatar platform itself is not self-hosted | Viewer reference only, not core provider |

## Low-Cost Architecture

### Phase 1: Product-Looking Demo Without Vendor Lock-In

- Build a high-quality base avatar library in Blender or from commercially cleared character assets.
- Use MediaPipe for pose/face landmarks and measurements.
- Use a StyleFit parametric body system: height, weight, shoulder, waist, hip, leg length, gender presentation.
- Use photo-derived face texture only when consent and quality gates pass; otherwise show a stylized but polished avatar.
- Export GLB/VRM with rig and PBR materials.

This will look much closer to ecommerce digital human demos than generic image-to-3D, while staying cheap and self-hostable.

### Phase 2: Self-Hosted Open-Source Asset Workers

- Use TRELLIS or Hunyuan3D-style workers for garment/product meshes.
- Use TripoSR as a fast fallback where quality requirements are lower.
- Keep output normalized to GLB plus metadata, not tied to a single model.

### Phase 3: StyleFit-Owned Digital Human Model

- Train or fine-tune body shape fitting, face identity, hair, and texture baking with consent-cleared data.
- Export a local model bundle under `workers/stylefit_avatar/models/manifest.json`.
- Let `workers/stylefit_avatar/digital_human.py` validate runners, weights, configs, priors, and quality gates before returning `avatarModelUri`.

## Deployment Options

### Local Development

- Run small perception models on Mac or CPU.
- Run TripoSR for fast GLB tests if dependencies are available.
- Run TRELLIS/Hunyuan-style models only on a CUDA machine or cloud GPU.

### Cloud Self-Hosted

- Package each worker as a Docker image.
- Use one GPU queue for slow generation jobs.
- Store generated GLB/USDZ assets in S3-compatible storage.
- Keep the mobile app pointed at StyleFit's own Reconstruction API.
- Cache generated avatars so repeat app opens do not hit the GPU.

### Cost Control

- Use async jobs and queueing.
- Generate once, cache forever until the user deletes or regenerates.
- Run high-quality texture only after the user confirms the base body result.
- Use spot GPU instances for batch generation where acceptable.
- Keep a CPU-only parametric fallback for demos and low-priority users.

## License Rules

- MIT / Apache-2.0 projects are preferred, but verify pretrained model terms separately.
- Non-commercial research projects must not ship in App Store production without a commercial license.
- Custom community licenses must be reviewed for territory, MAU, attribution, hosted-service, and derivative-model restrictions.
- Generated outputs and user photos must be covered by privacy, consent, deletion, and training opt-in flows.

## Practical Path For StyleFit

1. Keep `stylefit` as the only default production provider.
2. Add a self-hosted `trellis` or `hunyuan3d` worker for garment/product GLB experiments.
3. Build a polished StyleFit base-avatar system instead of showing low-quality generated humans. The first implementation is `STYLEFIT_AVATAR_ENABLE_PARAMETRIC_MVP=1`, which returns `provenance: "stylefit-parametric-digital-human"`.
4. Replace the procedural fallback with a local parametric preview bundle when owned or license-cleared GLB mannequins are available. Use `workers/stylefit_avatar/parametric_manifest.example.json` as the contract.
5. Use open-source perception modules to drive measurements and face alignment.
6. Train proprietary identity/body/texture modules only after data and GPU resources are available.

This path avoids a paid API choke point while still reaching a credible ecommerce digital-human experience before full custom model training is complete.