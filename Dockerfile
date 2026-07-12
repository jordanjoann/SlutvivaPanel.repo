FROM node:22-alpine3.22 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine3.22 AS production-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine3.22 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine3.22 AS runner
WORKDIR /app
RUN apk add --no-cache \
  age \
  bash \
  blender \
  dotnet9-sdk \
  git \
  mesa-egl \
  mesa-gl \
  py3-numpy \
  py3-pip \
  python3 \
  tar \
  unzip \
  util-linux \
  xz \
  zstd
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/docker ./docker
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json /app/package-lock.json ./
EXPOSE 3000
CMD ["npm", "start"]
