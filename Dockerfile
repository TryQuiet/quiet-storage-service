FROM node:22.14.0-slim AS base

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH" \
    ROOT=/usr/src/qss

RUN corepack enable

WORKDIR ${ROOT}
COPY package.json pnpm-lock.yaml ./
COPY . .

FROM base AS builder
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm run bootstrap -v

EXPOSE 3000
CMD ["pnpm", "run", "start:bare"]