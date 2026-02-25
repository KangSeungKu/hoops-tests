# Nest + React 앱 (API + 정적 프론트엔드)
# DWG/STEP/IGES 변환을 위해 상위(HOOPS 루트) 컨텍스트에서 authoring/converter 복사 가능
# 빌드: docker compose에서 context: ${HOOPSS_PACKAGE_PATH:-../}, dockerfile: streaming-viewer-prototype/Dockerfile.app
FROM node:22-bookworm-slim AS base

# 1) Frontend 빌드
FROM base AS frontend-build
WORKDIR /app/frontend
COPY streaming-viewer-prototype/frontend/package.json streaming-viewer-prototype/frontend/yarn.lock* ./
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY streaming-viewer-prototype/frontend/ ./
RUN yarn build

# 2) Backend 빌드
FROM base AS backend-build
WORKDIR /app/backend
COPY streaming-viewer-prototype/backend/package.json streaming-viewer-prototype/backend/yarn.lock* ./
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY streaming-viewer-prototype/backend/ ./
RUN yarn build

# 3) 런타임 (converter 포함 시 glibc + OpenGL 라이브러리 필요)
FROM base AS runtime
WORKDIR /app
# HOOPS Converter 의존성: libGLU.so.1, libGL 등 (헤드리스 변환용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglu1-mesa \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*
COPY streaming-viewer-prototype/backend/package.json ./
RUN yarn install --production --frozen-lockfile 2>/dev/null || yarn install --production
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./public
# HOOPS Converter (DWG/STEP/IGES → SC). 컨텍스트에 있으면 복사
COPY authoring/converter/bin/linux64 /app/converter/bin
RUN chmod +x /app/converter/bin/converter 2>/dev/null || true
EXPOSE 3000
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"
ENV CONVERTER_BIN=/app/converter/bin/converter
CMD ["node", "dist/main.js"]
