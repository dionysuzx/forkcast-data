# DNS Notes

GitHub Pages URLs are enough for launch. Future custom domains:

- `data.forkcast.org` -> GitHub Pages custom domain for the static data browser and JSON/Markdown paths
- `mcp.forkcast.org` -> optional Cloudflare-hosted MCP/admin endpoint if a remote MCP transport is added later

Keep CDN caching enabled. Do not use site-wide Basic Auth; gate only `/admin` through a function route if a dynamic host is added.
