# ── Stage 1: build the Angular frontend ─────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY shared shared
COPY frontend frontend
RUN cd frontend && npm run build

# ── Stage 2: build the NestJS backend ───────────────────────────────────
FROM node:22-alpine AS backend-build
WORKDIR /build
COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY shared shared
COPY backend backend
RUN cd backend && npm run build

# ── Stage 3: runtime — NestJS serves the API and the Angular build ──────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build /build/backend/dist ./dist
COPY --from=frontend-build /build/frontend/dist/frontend/browser ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
