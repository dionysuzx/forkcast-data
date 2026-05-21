# forkcast-data Runbook

## Full Dummy End-to-End

```bash
cd /Users/lucy/fun/pm-lean
ENABLE_DUMMY_PIPELINE=true npm run dummy -- --out out
npm run derive -- --out out

cd /Users/lucy/fun/forkcast-data
ENABLE_DUMMY_PIPELINE=true npm run dummy:e2e
```

The latest snapshot ID is in `dist/latest/manifest.json`.

## Real Backfill

```bash
npm run backfill -- --source live --limit 12
npm run derive
npm run validate
npm run build-snapshot
npm run build-search
npm run run-evals
npm run build-site
```

## Live GitHub Actions Loop

1. `pm-lean` publishes `out/` to branch `pm-lean-feed`.
2. `pm-lean` dispatches `forkcast-data` workflow `data-pipeline.yml` with `source=pm-lean`.
3. `forkcast-data` also runs every 30 minutes with `source=live`.
4. The pipeline checks out `pm-lean-feed`, ingests the feed and Ethereum PM issue agendas, validates, builds immutable snapshots, builds search, runs evals, deploys Netlify, and dispatches `forkcast-astro`.

Manual dispatch:

```bash
gh workflow run data-pipeline.yml -R dionysuzx/forkcast-data -f source=live -f force_rebuild=true
```

Required automation secrets:

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `FORKCAST_ASTRO_DISPATCH_TOKEN`

Required variables:

- `PM_LEAN_FEED_REF=pm-lean-feed`
- optional `FORKCAST_DATA_PIPELINE_SOURCE=live`

## MCP Smoke

```bash
FORKCAST_DATA_LATEST_ROOT=/Users/lucy/fun/forkcast-data/dist/latest npm run mcp
```

Tools: `search_forkcast`, `get_upgrade`, `get_eip`, `get_call`, `get_decisions`, `get_devnet`, `trace_fact`.

## Production Secrets

- `ADMIN_TOKEN` or `ADMIN_PASSWORD_HASH`
- `GITHUB_TOKEN` with workflow dispatch access
- `NETLIFY_AUTH_TOKEN` for deploy automation
- `NETLIFY_SITE_ID` for deploy automation
- `FORKCAST_ASTRO_DISPATCH_TOKEN` for cross-repo Astro rebuild dispatch
- optional source/API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `DISCOURSE_API_KEY`, `DISCORD_BOT_TOKEN`
- `MIRROR_REMOTE_URL` for backup mirror workflow

Dummy output must not be published to production unless a workflow input includes an explicit bypass reason.
