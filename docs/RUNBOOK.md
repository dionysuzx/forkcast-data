# forkcast-data Runbook

## Full Dummy End-to-End

```bash
cd /Users/lucy/fun/pm-lean
ENABLE_DUMMY_PIPELINE=true npm run dummy -- --out out
npm run derive -- --out out

cd /Users/lucy/fun/forkcast-data
ENABLE_DUMMY_PIPELINE=true npm run dummy:e2e
```

The latest snapshot ID is printed by the command. After `compact-dist`, `/latest/*` is materialized for GitHub Pages and raw `/records/*` artifact links point to the exact Git commit.

## Real Backfill

```bash
npm run backfill -- --source canonical --limit 0 \
  --pm-root /Users/lucy/fun/pm \
  --pm-lean-out /Users/lucy/fun/pm-lean/out \
  --forkcast-root /Users/lucy/fun/forkcast \
  --eips-root /Users/lucy/fun/acd-process/EIPs \
  --eth-rnd-archive-root /Users/lucy/fun/ro-repos/eth-rnd-archive
npm run derive
npm run validate
npm run build-snapshot
npm run build-search
npm run run-evals
npm run build-site
npm run compact-dist
```

## Live GitHub Actions Loop

1. `forkcast-data` runs `data-pipeline.yml` every 12 hours with `source=canonical`.
2. The pipeline checks out official EIPs, current Forkcast, `ethereum/eth-rnd-archive`, and optional `pm-lean-feed`.
3. The pipeline ingests all sources into one shared record layout and validates the result every run.
4. If canonical files changed, or `force_rebuild=true`, it builds immutable snapshots, builds search, runs fixture evals, compacts the deploy artifact, deploys GitHub Pages, and dispatches `forkcast-astro`.
5. If no canonical files changed on a scheduled run, it stops before snapshot/deploy so the 12-hour loop does not build a backlog of timestamp-only deployments.
6. `pm-lean` may also dispatch `forkcast-data` with `source=pm-lean`, but pm-lean is an optional upstream source, not the canonical data plane.

Manual dispatch:

```bash
gh workflow run data-pipeline.yml -R dionysuzx/forkcast-data -f source=canonical -f source_limit=0 -f force_rebuild=true
```

Required automation secrets:

- `FORKCAST_ASTRO_DISPATCH_TOKEN` for cross-repo Astro rebuild dispatch

Required variables:

- `PM_LEAN_FEED_REF=pm-lean-feed`
- optional `FORKCAST_DATA_PIPELINE_SOURCE=canonical`
- optional `FORKCAST_DATA_SOURCE_LIMIT=0` for full-source scheduled ingestion

## MCP Smoke

```bash
FORKCAST_DATA_LATEST_ROOT=/Users/lucy/fun/forkcast-data/dist/snapshots/<snapshotId> npm run mcp
```

Tools: `search_forkcast`, `get_upgrade`, `get_eip`, `get_call`, `get_decisions`, `get_devnet`, `trace_fact`.

## Production Secrets

- `ADMIN_TOKEN` or `ADMIN_PASSWORD_HASH`
- `GITHUB_TOKEN` with workflow dispatch access
- `FORKCAST_ASTRO_DISPATCH_TOKEN` for cross-repo Astro rebuild dispatch
- `CLOUDFLARE_API_TOKEN` only if hosted admin/API functions move to Cloudflare
- optional source/API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `DISCOURSE_API_KEY`, `DISCORD_BOT_TOKEN`
- `MIRROR_REMOTE_URL` for backup mirror workflow

Dummy output must not be published to production unless a workflow input includes an explicit bypass reason.
