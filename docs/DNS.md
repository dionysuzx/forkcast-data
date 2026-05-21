# DNS Notes

Netlify URLs are enough for launch. Future custom domains:

- `data.forkcast.org` -> primary Netlify site for the static data browser and JSON/Markdown paths
- `mcp.forkcast.org` -> optional hosted MCP endpoint if a remote MCP transport is added later

Keep CDN caching enabled. Do not use site-wide Basic Auth; gate only `/admin` through the function route.
