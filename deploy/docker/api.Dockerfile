FROM python:3.12-slim-bookworm AS timetable
WORKDIR /build
COPY scripts/import-gtfs.py ./import-gtfs.py
RUN python import-gtfs.py --output /out/gtfs.json.gz
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
ENV NODE_OPTIONS="--max-old-space-size=160 --max-semi-space-size=4"
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node src/server ./src/server
COPY --chown=node:node public ./public
COPY --from=timetable --chown=node:node /out/gtfs.json.gz ./data/gtfs.json.gz
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server/index.js"]
