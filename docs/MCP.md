# MCP Setup

Use the read-only stdio MCP server:

```bash
FORKCAST_DATA_LATEST_ROOT=/Users/lucy/fun/forkcast-data/dist/latest npm run mcp
```

Client configs are in `agent/mcp-configs/`.

Every response includes citations or source URLs. Treat `/latest/*` as convenient pointers and `/snapshots/<snapshotId>/*` as immutable references.
