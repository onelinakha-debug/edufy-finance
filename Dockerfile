FROM node:20-slim AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile 2>/dev/null || npm install
COPY . .
RUN npx vite build

FROM rust:1.82-bookworm AS backend
RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY src-tauri/ src-tauri/
COPY --from=frontend /app/dist dist
RUN cd src-tauri && cargo build --release --locked 2>/dev/null || cargo build --release
RUN cp src-tauri/target/release/edufy-finance /usr/local/bin/edufy-finance

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-0 libgtk-3-0 libsoup-3.0-0 \
    libjavascriptcoregtk-4.1-0 libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /usr/local/bin/edufy-finance /usr/local/bin/
COPY --from=frontend /app/dist /app/dist
ENV WEB_MODE=1
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["edufy-finance", "--web"]
