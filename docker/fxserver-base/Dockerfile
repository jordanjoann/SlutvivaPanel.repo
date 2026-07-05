FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    libatomic1 \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /server-data
