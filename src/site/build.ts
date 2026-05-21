import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeText } from "../lib/fs.js";
import type { EipReadModel, SearchDocument, SnapshotManifest } from "../domain/types.js";

const html = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">Forkcast Data</a>
    <nav>
      <a href="/browser.html">Data</a>
      <a href="/search.html">Search</a>
      <a href="/snapshots.html">Snapshots</a>
      <a href="/schemas.html">Schemas</a>
      <a href="/mcp.html">MCP</a>
      <a href="/admin/">Admin</a>
      <a href="/llms.txt">llms.txt</a>
    </nav>
  </header>
  <main>${body}</main>
  <script type="module" src="/assets/site.js"></script>
</body>
</html>
`;

const css = `
:root{color-scheme:light dark;--bg:#f7f8f5;--fg:#17201c;--muted:#627067;--line:#d9ded8;--panel:#ffffff;--accent:#0f766e;--accent2:#9a3412}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
a{color:inherit}.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 22px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px)}
.brand{font-weight:700;text-decoration:none}.topbar nav{display:flex;gap:14px;flex-wrap:wrap}.topbar nav a{color:var(--muted);text-decoration:none;font-size:14px}.topbar nav a:hover{color:var(--fg)}
main{max-width:1160px;margin:0 auto;padding:34px 22px 64px}.hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:36px;align-items:end;margin-bottom:34px}.hero h1{font-size:clamp(34px,6vw,74px);line-height:.95;margin:0 0 18px}.hero p{max-width:680px;color:var(--muted);font-size:18px}.statline{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{border-top:2px solid var(--fg);padding-top:10px}.stat strong{font-size:28px;display:block}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:20px 0}.input{width:min(100%,680px);height:42px;padding:0 12px;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px}.button{height:38px;border:1px solid var(--line);background:var(--fg);color:var(--bg);border-radius:6px;padding:0 12px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.item{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:15px;min-width:0}.item h3{margin:0 0 8px;font-size:16px}.item p{margin:0;color:var(--muted)}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;overflow:auto}.list{display:grid;gap:9px}.row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding:11px 0}.row small{color:var(--muted)}.copy{border:1px solid var(--line);background:var(--panel);border-radius:6px;padding:7px 9px;cursor:pointer}pre{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:16px;overflow:auto}.locked{border-left:4px solid var(--accent2);padding-left:14px}
.form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:10px;margin:18px 0}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.control{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:14px}.control button:disabled{opacity:.45;cursor:not-allowed}.pill{display:inline-flex;align-items:center;min-height:24px;border:1px solid var(--line);border-radius:999px;padding:2px 9px;color:var(--muted);font-size:12px}label{display:grid;gap:5px;color:var(--muted);font-size:13px}label input{font:inherit;color:var(--fg)}
@media(max-width:760px){.topbar{align-items:flex-start;flex-direction:column}.hero{grid-template-columns:1fr}.grid,.statline,.status-grid,.form{grid-template-columns:1fr}.row,.control{flex-direction:column;align-items:flex-start}.hero h1{font-size:42px}}
`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#17201c"/>
  <path d="M8 8h16v4H12v4h10v4H12v4H8z" fill="#f7f8f5"/>
  <path d="M20 12h4v12h-4z" fill="#0f766e"/>
</svg>
`;

const faviconIco = (): Buffer => {
  const size = 16;
  const xorSize = size * size * 4;
  const maskSize = size * 4;
  const imageSize = 40 + xorSize + maskSize;
  const file = Buffer.alloc(22 + imageSize);
  file.writeUInt16LE(0, 0);
  file.writeUInt16LE(1, 2);
  file.writeUInt16LE(1, 4);
  file[6] = size;
  file[7] = size;
  file.writeUInt16LE(1, 10);
  file.writeUInt16LE(32, 12);
  file.writeUInt32LE(imageSize, 14);
  file.writeUInt32LE(22, 18);

  const dib = 22;
  file.writeUInt32LE(40, dib);
  file.writeInt32LE(size, dib + 4);
  file.writeInt32LE(size * 2, dib + 8);
  file.writeUInt16LE(1, dib + 12);
  file.writeUInt16LE(32, dib + 14);
  file.writeUInt32LE(0, dib + 16);
  file.writeUInt32LE(xorSize, dib + 20);

  const pixels = dib + 40;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = pixels + ((size - 1 - y) * size + x) * 4;
      const isAccent = x >= 10 && x < 12 && y >= 6 && y < 13;
      const isMark =
        (x >= 4 && x < 12 && y >= 4 && y < 6) ||
        (x >= 4 && x < 10 && y >= 7 && y < 9) ||
        (x >= 4 && x < 6 && y >= 4 && y < 13);
      const color = isAccent ? [0x6e, 0x76, 0x0f] : isMark ? [0xf5, 0xf8, 0xf7] : [0x1c, 0x20, 0x17];
      file[offset] = color[0] ?? 0;
      file[offset + 1] = color[1] ?? 0;
      file[offset + 2] = color[2] ?? 0;
      file[offset + 3] = 0xff;
    }
  }
  return file;
};

const js = `
const searchInput=document.querySelector('[data-search-input]');
const results=document.querySelector('[data-search-results]');
const resultMarkup=(d,score)=>'<div class="row"><span><a href="'+d.url+'"><strong>'+d.title+'</strong></a><br><small>'+d.kind+(score?' score '+score:'')+' · '+(d.citations?.[0]?.label||'source')+'</small></span><span><a class="copy" href="'+(d.citations?.[0]?.url||d.url)+'">Source</a></span></div>';
if(searchInput&&results){let docs=[];fetch('/latest/search/index.json').then(r=>r.json()).then(v=>{docs=v});searchInput.addEventListener('input',()=>{const q=searchInput.value.toLowerCase().trim().split(/\\W+/).filter(Boolean);const hits=docs.map(d=>({d,score:q.reduce((s,t)=>s+(d.title+' '+d.body+' '+d.tags.join(' ')).toLowerCase().split(t).length-1,0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);results.innerHTML=hits.map(({d,score})=>resultMarkup(d,score)).join('')||'<p>No matches.</p>'})}
document.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',()=>navigator.clipboard.writeText(btn.getAttribute('data-copy')||'')));
const adminForm=document.querySelector('[data-admin-form]');
const adminStatus=document.querySelector('[data-admin-status]');
const adminControls=document.querySelector('[data-admin-controls]');
const renderAdmin=(payload)=>{if(!adminStatus||!adminControls)return;adminStatus.textContent=JSON.stringify({authorized:payload.authorized,status:payload.status,secrets:payload.secrets},null,2);const controls=payload.controls||{};adminControls.innerHTML=Object.entries(controls).map(([name,control])=>'<div class="control"><span><strong>'+name+'</strong><br><small>'+(control.requiredSecrets||[]).join(', ')+'</small></span><button class="copy" data-admin-action="'+name+'" '+(control.enabled?'':'disabled')+'>'+(control.enabled?'Run':'Missing secrets')+'</button></div>').join('')||'<p>No controls configured.</p>';adminControls.querySelectorAll('[data-admin-action]').forEach(btn=>btn.addEventListener('click',async()=>{const action=btn.getAttribute('data-admin-action');btn.textContent='Dispatching';const headers=window.__adminHeaders||{};const res=await fetch('/api/admin',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action})});adminStatus.textContent=JSON.stringify(await res.json(),null,2);btn.textContent='Run'}));};
if(adminForm){const load=(headers={})=>fetch('/api/admin',{headers}).then(r=>r.json()).then(renderAdmin).catch(e=>{if(adminStatus)adminStatus.textContent=String(e)});load();adminForm.addEventListener('submit',(event)=>{event.preventDefault();const data=new FormData(adminForm);const token=String(data.get('token')||'').trim();const password=String(data.get('password')||'').trim();const headers={};if(token)headers.authorization='Bearer '+token;if(password)headers['x-admin-password']=password;window.__adminHeaders=headers;load(headers)})}
`;

export const buildSite = async (distRoot: string): Promise<void> => {
  const latestRoot = join(distRoot, "latest");
  const manifest = await readJson<SnapshotManifest>(join(latestRoot, "manifest.json"));
  const eips = await readJson<EipReadModel[]>(join(latestRoot, "eips", "index.json")).catch(() => []);
  const searchDocs = await readJson<SearchDocument[]>(join(latestRoot, "search", "index.json")).catch(() => []);
  await writeText(join(distRoot, "assets", "site.css"), css);
  await writeText(join(distRoot, "assets", "site.js"), js);
  await writeText(join(distRoot, "favicon.svg"), faviconSvg);
  await writeFile(join(distRoot, "favicon.ico"), faviconIco());
  await writeText(join(distRoot, "index.html"), html("Forkcast Data", `<section class="hero"><div><h1>Forkcast Data</h1><p>Repo-backed Ethereum upgrade intelligence with durable records, provenance, snapshots, search, and agent-native MCP access.</p><div class="toolbar"><a class="button" href="/search.html">Search data</a><a class="copy" href="/mcp.html">Set up agent</a></div></div><div class="statline"><div class="stat"><strong>${manifest.record_count}</strong><span>records</span></div><div class="stat"><strong>${eips.length}</strong><span>EIPs</span></div><div class="stat"><strong>${manifest.snapshot_id.slice(0, 12)}</strong><span>snapshot</span></div></div></section><section class="grid"><a class="item" href="/latest/catalog.json"><h3>Catalog JSON</h3><p>Top-level discovery contract.</p></a><a class="item" href="/latest/manifest.json"><h3>Latest Manifest</h3><p>Snapshot pointer and read model inventory.</p></a><a class="item" href="/browser.html"><h3>Data Browser</h3><p>Browse calls, EIPs, upgrades, devnets, and decisions.</p></a></section>`));
  await writeText(join(distRoot, "search.html"), html("Forkcast Search", `<h1>Search</h1><p>Static prebuilt index with provenance-rich results.</p><div class="toolbar"><input class="input" data-search-input placeholder="Search EIPs, calls, decisions, devnets, provenance" autofocus></div><div class="list" data-search-results>${searchDocs.slice(0, 8).map((doc) => `<div class="row"><span><a href="${doc.url}"><strong>${doc.title}</strong></a><br><small>${doc.kind} · ${doc.citations[0]?.label ?? "source"}</small></span><span><a class="copy" href="${doc.citations[0]?.url ?? doc.url}">Source</a></span></div>`).join("")}</div>`));
  await writeText(join(distRoot, "browser.html"), html("Forkcast Data Browser", `<h1>Data Browser</h1><div class="grid"><a class="item" href="/latest/eips/index.json"><h3>EIPs</h3><p>${eips.length} proposal read models.</p></a><a class="item" href="/latest/calls/index.json"><h3>Calls</h3><p>PM calls from manifests, GitHub issues, and pm-lean.</p></a><a class="item" href="/latest/decisions/index.ndjson"><h3>Decisions</h3><p>Line-delimited decision stream.</p></a><a class="item" href="/latest/upgrades/glamsterdam.json"><h3>Glamsterdam</h3><p>Upgrade read model.</p></a><a class="item" href="/latest/devnets/bal-devnet-6.json"><h3>Devnets</h3><p>Devnet records and provenance.</p></a><a class="item" href="/snapshots/index.json"><h3>Snapshots</h3><p>Immutable snapshot index.</p></a></div>`));
  await writeText(join(distRoot, "snapshots.html"), html("Forkcast Snapshots", `<h1>Snapshots</h1><p>Latest snapshot: <code>${manifest.snapshot_id}</code></p><pre>${JSON.stringify(manifest, null, 2)}</pre>`));
  await writeText(join(distRoot, "schemas.html"), html("Forkcast Schemas", `<h1>Schemas</h1><div class="list"><a class="row" href="/schemas/record-manifest.schema.json">Record manifest schema</a><a class="row" href="/schemas/catalog.schema.json">Catalog schema</a><a class="row" href="/schemas/snapshot-manifest.schema.json">Snapshot manifest schema</a></div>`));
  const mcpConfig = JSON.stringify({ mcpServers: { forkcast: { command: "npx", args: ["tsx", "src/mcp/server.ts"], env: { FORKCAST_DATA_LATEST_ROOT: "/path/to/forkcast-data/dist/latest" } } } }, null, 2);
  await writeText(join(distRoot, "mcp.html"), html("Forkcast MCP", `<h1>MCP Setup</h1><p>Read-only tools: search_forkcast, get_upgrade, get_eip, get_call, get_decisions, get_devnet, trace_fact.</p><button class="copy" data-copy='${mcpConfig.replaceAll("'", "&apos;")}'>Copy config</button><pre>${mcpConfig}</pre><p><a href="/agent/codex-skill/SKILL.md">Codex skill artifact</a> · <a href="/agent/mcp-configs/claude_desktop_config.json">Claude config</a> · <a href="/agent/mcp-configs/gemini_mcp_config.json">Gemini config</a></p>`));
  await writeText(join(distRoot, "admin", "index.html"), html("Forkcast Admin", `<h1>Admin</h1><p class="locked">This route uses function-level auth only. Public data remains cacheable, and controls stay disabled until the matching production secrets exist.</p><form class="form" data-admin-form><label>Admin token<input class="input" name="token" autocomplete="off" placeholder="Bearer token value"></label><label>Password<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Password for ADMIN_PASSWORD_HASH"></label><button class="button" type="submit">Unlock</button></form><section class="status-grid"><div><h2>Run Status</h2><pre data-admin-status>Checking...</pre></div><div><h2>Controls</h2><div class="list" data-admin-controls><span class="pill">Checking secrets</span></div></div></section>`));
  await writeText(join(distRoot, "llms.txt"), `# Forkcast Data\n\nCanonical data plane: /latest/catalog.json\nLatest snapshot manifest: /latest/manifest.json\nMCP setup: /mcp.html\nSearch index: /latest/search/index.json\n`);
  await cp("schemas", join(distRoot, "schemas"), { recursive: true });
  await cp("agent", join(distRoot, "agent"), { recursive: true });
  await cp("examples", join(distRoot, "examples"), { recursive: true });
};
