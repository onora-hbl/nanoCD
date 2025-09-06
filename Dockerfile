FROM node:23-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json ./
COPY pnpm-lock.yaml ./

FROM base AS build

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

FROM base as dependencies

RUN pnpm install --frozen-lockfile --prod

FROM node:23-alpine AS production

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=dependencies /app/node_modules ./node_modules

CMD ["npm", "run", "start"]