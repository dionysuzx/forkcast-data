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
npm run backfill -- --source all --limit 12
npm run derive
npm run validate
npm run build-snapshot
npm run build-search
npm run run-evals
npm run build-site
```

## MCP Smoke

```bash
FORKCAST_DATA_LATEST_ROOT=/Users/lucy/fun/forkcast-data/dist/latest npm run mcp
```

Tools: `search_forkcast`, `get_upgrade`, `get_eip`, `get_call`, `get_decisions`, `get_devnet`, `trace_fact`.

## Production Secrets

- `ADMIN_TOKEN` or `ADMIN_PASSWORD_HASH`
- `GITHUB_TOKEN` with workflow dispatch access
- `NETLIFY_AUTH_TOKEN` for deploy automation
- optional source/API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `DISCOURSE_API_KEY`, `DISCORD_BOT_TOKEN`
- `MIRROR_REMOTE_URL` for backup mirror workflow

Dummy output must not be published to production unless a workflow input includes an explicit bypass reason.
