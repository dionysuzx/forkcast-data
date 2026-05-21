set dotenv-load := true

source := env_var_or_default("SOURCE", "all")

install:
    npm install

ingest:
    npm run ingest -- --source {{source}}

derive:
    npm run derive

backfill:
    npm run backfill -- --source {{source}}

validate:
    npm run validate

build-snapshot:
    npm run build-snapshot

build-search:
    npm run build-search

run-evals:
    npm run run-evals

build-site:
    npm run build-site

dummy-e2e:
    ENABLE_DUMMY_PIPELINE=true npm run dummy:e2e

mcp:
    npm run mcp

verify:
    npm run verify

deploy-preview:
    npx netlify deploy

deploy-prod:
    npx netlify deploy --prod
