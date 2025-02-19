set -e

# nvm use 23
pnpm install

# can not add into devDependencies
pnpm add @elizaos/adapter-sqlite@0.1.9 better-sqlite3@11.8.1

# cp .env.example .env
# add required env to .env
source .env

pnpm debug
