# RVC voice-changer GPU service. NVIDIA GPU required; never expose port 8080 to browsers.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu118

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/rvc-service

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.10 python3-pip git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install --index-url ${TORCH_INDEX_URL} torch==2.1.1+cu118 torchaudio==2.1.1+cu118

WORKDIR /opt/rvc-service
COPY requirements.txt ./
RUN python3 -m pip install -r requirements.txt
COPY app ./app

EXPOSE 8080
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
