FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/opt/huggingface
ARG EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
ARG ENABLE_WHISPER=false
ARG WHISPER_MODEL_SIZE=base
ENV ENABLE_WHISPER=${ENABLE_WHISPER} \
    WHISPER_MODEL_SIZE=${WHISPER_MODEL_SIZE} \
    WHISPER_MODEL_DIR=/opt/whisper
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ffmpeg && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 appuser
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"
RUN if [ "$ENABLE_WHISPER" = "true" ]; then python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL_SIZE}', device='cpu', compute_type='int8', download_root='/opt/whisper')"; fi
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
COPY app ./app
RUN chown -R appuser:appuser /app /opt/huggingface
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD python -c "import os,urllib.request; req=urllib.request.Request('http://127.0.0.1:8000/nlp/health',headers={'X-Internal-Key':os.environ['INTERNAL_KEY']}); urllib.request.urlopen(req,timeout=5)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
