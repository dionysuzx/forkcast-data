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
  latest/                     # revalidating pointer materialized for GitHub Pages
  snapshots/<snapshotId>/...
```

MCP, search, admin, API functions, and the static site are serving layers over canonical files. They are not the source of truth.

## Local Commands

```bash
npm install
npm run backfill -- --source canonical --limit 0 \
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
npm run mcp
ENABLE_DUMMY_PIPELINE=true npm run dummy:e2e
```

One-time PM archive migration is intentionally separate from the canonical loop:

```bash
npm run migrate-pm-legacy -- --pm-root /Users/lucy/fun/pm --limit 0
```

## Sources

- current Forkcast data and curated records
- official `ethereum/EIPs` markdown for the full EIP corpus, enriched by Forkcast where available
- migrated PM legacy/archive files, stored as canonical `pm-legacy` records in this repo
- optional `pm-lean` output
- `ethereum/pm` GitHub protocol-call issues, including agenda bodies, labels, comments, and linked resources
- `ethereum/eth-rnd-archive` Discord archive day/channel partitions
- Ethereum Magicians topic links from PM issues
- dummy fixture data, explicitly guarded

## Alive Automation

The `Data Pipeline` GitHub Action runs every 12 hours and defaults to `source=canonical`. That mode checks out official EIPs, current Forkcast, `ethereum/eth-rnd-archive`, and the optional pm-lean feed; ingests them into the shared record layout; validates schemas/provenance; and publishes only when canonical files changed or `force_rebuild=true`.

The pipeline no longer checks out or ingests live `ethereum/pm` repository contents. Historical PM folders are migrated into `forkcast-data` once and remain provenance-rich records here. New PM-like artifacts should flow through `pm-lean` feed artifacts or direct `forkcast-data` records instead of automated commits to `ethereum/pm` master.

Dummy smoke data is not part of the canonical loop. pm-lean is no longer the canonical data plane; it is an optional upstream artifact source that can be dropped in or removed without changing the durable `forkcast-data` contract.

Before deploy, `compact-dist` keeps the current immutable read-model snapshot and a physical `/latest/*` tree for GitHub Pages. Raw `/records/*` artifact links are written to the exact Git commit on GitHub, keeping provenance inspectable without uploading duplicate copies of the full Discord/EIP corpus on every 12-hour run.

## GitHub Pages

The active production target is GitHub Pages:

- Data site: `https://dionysuzx.github.io/forkcast-data/`
- Project base path: `/forkcast-data`
- Search is static and runs from prebuilt `/latest/search/fast/*` shards.
- `/admin` is visible as static status UI; live rerun controls require a future Cloudflare Worker or another function host because GitHub Pages is static-only.

Optional Netlify function code remains in the repo as a serving-layer artifact, but Netlify is no longer the active deploy path.

See [docs/RUNBOOK.md](docs/RUNBOOK.md) and [docs/DNS.md](docs/DNS.md).
