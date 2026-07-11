FROM node:22-alpine3.22 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

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
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
