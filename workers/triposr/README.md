# TripoSR Self-Hosted Worker

This worker runs an open-source image-to-3D pipeline for StyleFit.

- Engine: TripoSR
- Repository: [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR)
- License: MIT
- Output: GLB served from `/models/.../mesh.glb`

TripoSR is a generic single-image 3D reconstruction model. It is not a rigged, identity-preserving human avatar system. It is the first self-hosted step away from paid image-to-3D APIs.

## Docker GPU Run

```bash
docker build -t stylefit-triposr-worker workers/triposr
docker run --gpus all -p 8790:8790 \
  -e PUBLIC_MODEL_BASE_URL=http://localhost:8790/models \
  stylefit-triposr-worker
```

Then start the Node API in another terminal:

```bash
AVATAR_RECONSTRUCTION_PROVIDER=triposr \
TRIPOSR_WORKER_URL=http://localhost:8790 \
PORT=8787 npm run reconstruction:api
```

## Local Python Run

```bash
git clone https://github.com/VAST-AI-Research/TripoSR.git ../TripoSR
python -m venv .venv-triposr
source .venv-triposr/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r ../TripoSR/requirements.txt
pip install -r workers/triposr/requirements.txt
TRIPOSR_REPO_DIR=$PWD/../TripoSR \
PUBLIC_MODEL_BASE_URL=http://localhost:8790/models \
uvicorn workers.triposr.worker:app --host 0.0.0.0 --port 8790
```

CPU mode may work but is slow. A CUDA GPU is strongly recommended.
