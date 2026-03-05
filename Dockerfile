FROM oven/bun:alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
