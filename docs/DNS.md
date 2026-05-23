# DNS Notes

Cloudflare Pages URLs are enough for launch. Future custom domains:

- `data.forkcast.org` -> Cloudflare Pages custom domain for the static data browser and JSON/Markdown paths
- `mcp.forkcast.org` -> Cloudflare Worker custom domain if a remote MCP transport is added later

Keep CDN caching enabled. Do not use site-wide Basic Auth; gate only `/admin` through a Cloudflare Pages Function or Worker route.
