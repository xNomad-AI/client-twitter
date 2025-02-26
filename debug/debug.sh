set -e

# nvm use 23
pnpm install

export https_proxy='http://localhost:10711'
# can not add into devDependencies
pnpm add @elizaos/adapter-sqlite@0.1.9 better-sqlite3@11.8.1 express@^4.21.2
unset https_proxy

# cp .env.example .env
# add required env to .env
source .env

pnpm debug

# pnpm remove @elizaos/adapter-sqlite@0.1.9 better-sqlite3@11.8.1 express@^4.21.2
