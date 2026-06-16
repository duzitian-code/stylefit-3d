FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV TRIPOSR_REPO_DIR=/opt/TripoSR
ENV TRIPOSR_OUTPUT_DIR=/data/output
ENV PUBLIC_MODEL_BASE_URL=http://localhost:8790/models

RUN apt-get update \
  && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git /opt/TripoSR
WORKDIR /opt/TripoSR
RUN pip install --upgrade pip setuptools wheel \
  && pip install -r requirements.txt

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY worker.py /app/worker.py

EXPOSE 8790
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8790"]