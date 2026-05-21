# forkcast-data

`forkcast-data` is Forkcast's canonical repo-backed data plane for Ethereum upgrade intelligence.

The durable contract is file-first:

```text
catalog.json
records/
  call/<series>/<yyyy.mm.dd>-<number>/manifest.json
  proposal/eip-7702/manifest.json
  upgrade/glamsterdam/manifest.json
  topic/ethereum-magicians/<id>/manifest.json
  thread/discord-archive/<channel>/<date>/manifest.json
dist/
  latest/...
  snapshots/<snapshotId>/...
```

MCP, search, admin, API functions, and the Netlify site are serving layers over canonical files. They are not the source of truth.

## Local Commands

```bash
npm install
npm run backfill -- --source live --limit 12
npm run derive
npm run validate
npm run build-snapshot
npm run build-search
npm run run-evals
npm run build-site
npm run mcp
ENABLE_DUMMY_PIPELINE=true npm run dummy:e2e
```

## Sources

- current Forkcast data and curated records
- upstream PM artifacts
- `pm-lean` output
- `pm-lean` fixture-live feed records from the `pm-lean-feed` branch while upstream PM automation is being wired
- `ethereum/pm` GitHub protocol-call issues
- Ethereum R&D Discord archive
- Ethereum Magicians topic links from PM issues
- dummy fixture data, explicitly guarded

## Alive Automation

The `Data Pipeline` GitHub Action runs every 30 minutes and defaults to `source=live`. That mode checks out `dionysuzx/pm-lean@pm-lean-feed`, ingests PM Lean feed records, refreshes Ethereum PM issue agendas through `gh`, validates schemas/provenance, builds snapshots/search/evals/site, deploys Netlify, then dispatches `forkcast-astro`.

Dummy smoke data is not part of the live loop. The only synthetic live input is PM Lean `fixture-live`, which is labeled at the source and can be replaced by setting the PM Lean schedule to `source=pm`.

## Netlify

The site publishes `dist/` and uses `netlify.toml` for caching:

- `/snapshots/*`: immutable
- `/latest/*`: short revalidation
- `/api/admin`: no-store, route-gated auth
- `/api/search`: cacheable function fallback

See [docs/RUNBOOK.md](docs/RUNBOOK.md) and [docs/DNS.md](docs/DNS.md).
