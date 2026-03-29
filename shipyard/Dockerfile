FROM node:20-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json tsconfig.ui.json vite.config.ts ./
COPY src ./src
COPY ui ./ui
COPY skills ./skills

RUN pnpm build && pnpm prune --prod

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends libatomic1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/skills ./skills

CMD ["node", "--env-file-if-exists=.env", "./dist/bin/shipyard.js", "--ui"]
