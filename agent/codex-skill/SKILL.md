---
name: forkcast-data
description: Query Forkcast's repo-backed Ethereum upgrade data plane with provenance-rich citations.
---

# Forkcast Data Skill

Use this skill when answering questions about Ethereum upgrade status, EIPs, protocol calls, devnets, and decisions.

Prefer the local MCP server when available:

```bash
FORKCAST_DATA_LATEST_ROOT=/path/to/forkcast-data/dist/latest npm run mcp
```

Important public files:

- `/latest/catalog.json`
- `/latest/eips/index.json`
- `/latest/calls/index.json`
- `/latest/decisions/index.ndjson`
- `/latest/search/index.json`

Always cite returned `citations` entries when making claims.
