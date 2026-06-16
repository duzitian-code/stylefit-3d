FROM python:3.12-slim

WORKDIR /app

COPY workers/__init__.py ./workers/__init__.py
COPY workers/stylefit_avatar ./workers/stylefit_avatar
RUN pip install --no-cache-dir -r workers/stylefit_avatar/requirements.txt

ENV STYLEFIT_AVATAR_OUTPUT_DIR=/data/stylefit-avatar-output
ENV STYLEFIT_AVATAR_PUBLIC_MODEL_BASE_URL=http://localhost:8791/models
ENV STYLEFIT_AVATAR_ENABLE_PARAMETRIC_MVP=1

EXPOSE 8791
CMD ["uvicorn", "workers.stylefit_avatar.worker:app", "--host", "0.0.0.0", "--port", "8791"]