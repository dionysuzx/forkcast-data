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
npm run backfill -- --source canonical --limit 0 \
  --pm-root /Users/lucy/fun/pm \
  --forkcast-root /Users/lucy/fun/forkcast \
  --eips-root /Users/lucy/fun/acd-process/EIPs \
  --eth-rnd-archive-root /Users/lucy/fun/ro-repos/eth-rnd-archive
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
- official `ethereum/EIPs` markdown for the full EIP corpus, enriched by Forkcast where available
- upstream PM artifacts
- optional `pm-lean` output
- `ethereum/pm` GitHub protocol-call issues, including agenda bodies, labels, comments, and linked resources
- `ethereum/eth-rnd-archive` Discord archive day/channel partitions
- Ethereum Magicians topic links from PM issues
- dummy fixture data, explicitly guarded

## Alive Automation

The `Data Pipeline` GitHub Action runs every 10 minutes and defaults to `source=canonical`. That mode checks out upstream PM, official EIPs, current Forkcast, `ethereum/eth-rnd-archive`, and the optional pm-lean feed; ingests them into the shared record layout; validates schemas/provenance; builds snapshots/search/evals/site; deploys Netlify; then dispatches `forkcast-astro`.

Dummy smoke data is not part of the canonical loop. pm-lean is no longer the canonical data plane; it is an optional upstream artifact source that can be dropped in or removed without changing the durable `forkcast-data` contract.

## Netlify

The site publishes `dist/` and uses `netlify.toml` for caching:

- `/snapshots/*`: immutable
- `/latest/*`: short revalidation
- `/api/admin`: no-store, route-gated auth
- `/api/search`: cacheable function fallback

See [docs/RUNBOOK.md](docs/RUNBOOK.md) and [docs/DNS.md](docs/DNS.md).
