FROM node:22-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STREAMLIT_BROWSER_GATHER_USAGE_STATS=false
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app
COPY prototypes/streamlit/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=app:app src/server ./src/server
COPY --chown=app:app public ./public
COPY --chown=app:app prototypes/streamlit ./prototypes/streamlit
COPY --chown=app:app .streamlit/config.toml ./.streamlit/config.toml
COPY --chown=app:app security/blocked-credential-fingerprints.json ./security/blocked-credential-fingerprints.json
COPY --chown=app:app deploy/public_entrypoint.py ./deploy/public_entrypoint.py
USER app
EXPOSE 10000
CMD ["python", "deploy/public_entrypoint.py"]
