import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeText } from "../lib/fs.js";
import type { CallReadModel, EipReadModel, SearchDocument, SnapshotManifest } from "../domain/types.js";

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
.source-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.metric{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:14px}.metric strong{display:block;font-size:26px}.metric span{color:var(--muted);font-size:13px}.search-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;align-items:start}.search-layout>section{min-width:0}.facets{position:sticky;top:82px;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:12px}.facet{display:flex;width:100%;justify-content:space-between;gap:10px;border:0;background:transparent;color:var(--fg);padding:8px;border-radius:6px;text-align:left;cursor:pointer}.facet[aria-pressed=true],.facet:hover{background:color-mix(in srgb,var(--accent) 10%,transparent)}.result{min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:14px;overflow-wrap:anywhere}.result+.result{margin-top:10px}.result h3{margin:0 0 6px}.result p{margin:0 0 10px;color:var(--muted);overflow-wrap:anywhere}.result a,.badge,pre,code{overflow-wrap:anywhere}.badges{display:flex;gap:6px;flex-wrap:wrap}.badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--muted)}.section{margin-top:34px}.split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.split>*,.status-grid>*{min-width:0}.table{width:100%;border-collapse:collapse;table-layout:fixed}.table th,.table td{border-bottom:1px solid var(--line);padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.table th{color:var(--muted);font-size:12px;font-weight:600;text-transform:uppercase}.ok{color:#047857}.fail{color:#b91c1c}.quiet{color:var(--muted)}.kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;font-size:12px;color:var(--muted)}
@media(max-width:900px){.search-layout,.split,.source-grid{grid-template-columns:1fr}.facets{position:static}}
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
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stopwords=new Set(['a','an','and','are','as','at','changed','does','find','for','from','in','involving','is','of','on','recent','the','this','to','trace','what','week','which','with']);
const terms=(value)=>String(value).toLowerCase().split(/[^a-z0-9]+/).filter((token)=>token.length>1&&!stopwords.has(token));
const countMatches=(tokens,term,cap)=>Math.min(tokens.filter((token)=>token.includes(term)).length,cap);
const eipNumber=(value)=>(String(value).match(/\\beip[-\\s]?(\\d+)\\b/i)||[])[1];
const scoreDoc=(doc,query,queryTerms)=>{
  const titleText=String(doc.title||'').toLowerCase(), tagText=String((doc.tags||[]).join(' ')).toLowerCase();
  const title=terms(doc.title), tags=terms((doc.tags||[]).join(' ')), body=terms(doc.body||'');
  const exact=eipNumber(query);
  const termScore=queryTerms.reduce((sum,term)=>sum+countMatches(title,term,8)*12+countMatches(tags,term,8)*8+countMatches(body,term,10),0);
  const exactScore=exact&&(doc.id==='eip-'+exact||titleText.includes('eip-'+exact)||tagText.includes('eip-'+exact))?250:0;
  const phrase=String(query||'').trim().toLowerCase();
  const phraseScore=phrase.length>3&&(titleText.includes(phrase)||tagText.includes(phrase))?40:0;
  const kindScore=queryTerms.includes('eip')&&doc.kind==='eip'?20:0;
  return termScore+exactScore+phraseScore+kindScore;
};
const snippet=(doc,queryTerms)=>{
  const body=String(doc.body||doc.title||'').replace(/\\s+/g,' ').trim();
  if(!queryTerms.length)return body.slice(0,260);
  const lower=body.toLowerCase();
  const index=queryTerms.map((term)=>lower.indexOf(term)).filter((value)=>value>=0).sort((a,b)=>a-b)[0]??0;
  return body.slice(Math.max(0,index-80),Math.max(260,index+260));
};
const resultMarkup=({d,score},queryTerms)=>'<article class="result"><h3><a href="'+d.url+'">'+escapeHtml(d.title)+'</a></h3><p>'+escapeHtml(snippet(d,queryTerms))+'</p><div class="badges"><span class="badge">'+escapeHtml(d.kind)+'</span><span class="badge">score '+score+'</span>'+((d.tags||[]).slice(0,5).map((tag)=>'<span class="badge">'+escapeHtml(tag)+'</span>').join(''))+'</div><p><a href="'+((d.citations&&d.citations[0]&&d.citations[0].url)||d.url)+'">source/provenance</a></p></article>';
const searchInput=document.querySelector('[data-search-input]');
const results=document.querySelector('[data-search-results]');
const count=document.querySelector('[data-search-count]');
const facets=[...document.querySelectorAll('[data-search-kind]')];
if(searchInput&&results){
  let docs=[],activeKind='all';
  const run=()=>{
    const query=searchInput.value;
    const queryTerms=terms(query);
    const scoped=activeKind==='all'?docs:docs.filter((doc)=>doc.kind===activeKind);
    const hits=(queryTerms.length?scoped.map((d)=>({d,score:scoreDoc(d,query,queryTerms)})).filter((hit)=>hit.score>0):scoped.slice(0,40).map((d)=>({d,score:1}))).sort((a,b)=>b.score-a.score||a.d.title.localeCompare(b.d.title)).slice(0,40);
    if(count)count.textContent=hits.length+' results from '+scoped.length+' '+activeKind+' docs';
    results.innerHTML=hits.map((hit)=>resultMarkup(hit,queryTerms)).join('')||'<p>No matches. Try an EIP number, call series, TLDR phrase, Discord channel, or source name.</p>';
  };
  fetch('/latest/search/index.json').then((r)=>r.json()).then((value)=>{docs=value;run();});
  const initialQuery=new URLSearchParams(window.location.search).get('q');
  if(initialQuery)searchInput.value=initialQuery;
  searchInput.addEventListener('input',run);
  facets.forEach((button)=>button.addEventListener('click',()=>{activeKind=button.getAttribute('data-search-kind')||'all';facets.forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));run();}));
  window.addEventListener('keydown',(event)=>{if(event.key==='/'&&document.activeElement!==searchInput){event.preventDefault();searchInput.focus();}});
}
document.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',()=>navigator.clipboard.writeText(btn.getAttribute('data-copy')||'')));
const adminForm=document.querySelector('[data-admin-form]');
const adminStatus=document.querySelector('[data-admin-status]');
const adminControls=document.querySelector('[data-admin-controls]');
const renderAdmin=(payload)=>{if(!adminStatus||!adminControls)return;adminStatus.textContent=JSON.stringify({authorized:payload.authorized,status:payload.status,evals:payload.evals,secrets:payload.secrets},null,2);const controls=payload.controls||{};adminControls.innerHTML=Object.entries(controls).map(([name,control])=>'<div class="control"><span><strong>'+escapeHtml(name)+'</strong><br><small>'+escapeHtml((control.requiredSecrets||[]).join(', ')||'ready')+'</small></span><button class="copy" data-admin-action="'+escapeHtml(name)+'" '+(control.enabled?'':'disabled')+'>'+(control.enabled?'Run':'Missing secrets')+'</button></div>').join('')||'<p>No controls configured.</p>';adminControls.querySelectorAll('[data-admin-action]').forEach(btn=>btn.addEventListener('click',async()=>{const action=btn.getAttribute('data-admin-action');btn.textContent='Dispatching';const headers=window.__adminHeaders||{};const res=await fetch('/api/admin',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action})});adminStatus.textContent=JSON.stringify(await res.json(),null,2);btn.textContent='Run'}));};
if(adminForm){const load=(headers={})=>fetch('/api/admin',{headers}).then(r=>{if(!r.ok)throw new Error('Admin API unavailable in this local static server');return r.json()}).then(renderAdmin).catch(e=>{if(adminStatus)adminStatus.textContent=String(e);if(adminControls)adminControls.innerHTML='<span class="pill">Netlify function required</span>'});load();adminForm.addEventListener('submit',(event)=>{event.preventDefault();const data=new FormData(adminForm);const token=String(data.get('token')||'').trim();const password=String(data.get('password')||'').trim();const headers={};if(token)headers.authorization='Bearer '+token;if(password)headers['x-admin-password']=password;window.__adminHeaders=headers;load(headers)})}
`;

export const buildSite = async (distRoot: string): Promise<void> => {
  const latestRoot = join(distRoot, "latest");
  const emptyStats: { artifact_count?: number; records_by_kind?: Record<string, number>; records_by_source?: Record<string, number> } = {};
  const manifest = await readJson<SnapshotManifest>(join(latestRoot, "manifest.json"));
  const eips = await readJson<EipReadModel[]>(join(latestRoot, "eips", "index.json")).catch(() => []);
  const calls = await readJson<CallReadModel[]>(join(latestRoot, "calls", "index.json")).catch(() => []);
  const threads = await readJson<Array<{ id: string; title: string; channel?: string; date?: string; message_count?: number; canonical_json_url: string }>>(join(latestRoot, "threads", "index.json")).catch(() => []);
  const stats = await readJson<{ artifact_count?: number; records_by_kind?: Record<string, number>; records_by_source?: Record<string, number> }>(join(latestRoot, "stats.json")).catch(() => emptyStats);
  const evals = await readJson<{ ok: boolean; results: Array<{ id: string; passed: boolean; answer: string }> }>(join(latestRoot, "evals", "results.json")).catch(() => ({ ok: false, results: [] }));
  const searchDocs = await readJson<SearchDocument[]>(join(latestRoot, "search", "index.json")).catch(() => []);
  const sourceRows = Object.entries(stats.records_by_source ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `<div class="metric"><strong>${count}</strong><span>${source}</span></div>`)
    .join("");
  const kindOptions = ["all", "eip", "call", "decision", "thread", "topic", "upgrade", "devnet"]
    .map((kind) => `<button class="facet" data-search-kind="${kind}" aria-pressed="${kind === "all"}"><span>${kind}</span><span>${kind === "all" ? searchDocs.length : searchDocs.filter((doc) => doc.kind === kind).length}</span></button>`)
    .join("");
  const recentCalls = calls.slice(0, 8).map((call) => `<div class="row"><span><a href="${call.canonical_json_url}"><strong>${call.title}</strong></a><br><small>${call.series} #${call.number} · ${call.date}</small></span><small>${call.decisions.length} decisions</small></div>`).join("");
  const recentThreads = threads.slice(0, 8).map((thread) => `<div class="row"><span><a href="${thread.canonical_json_url}"><strong>${thread.title}</strong></a><br><small>${thread.channel ?? "discord"} · ${thread.date ?? ""}</small></span><small>${thread.message_count ?? 0} messages</small></div>`).join("");
  const evalRows = evals.results.map((result) => `<tr><td>${result.id}</td><td class="${result.passed ? "ok" : "fail"}">${result.passed ? "pass" : "fail"}</td><td>${result.answer.slice(0, 180)}</td></tr>`).join("");
  await writeText(join(distRoot, "assets", "site.css"), css);
  await writeText(join(distRoot, "assets", "site.js"), js);
  await writeText(join(distRoot, "favicon.svg"), faviconSvg);
  await writeFile(join(distRoot, "favicon.ico"), faviconIco());
  await writeText(join(distRoot, "index.html"), html("Forkcast Data", `<section class="hero"><div><h1>Forkcast Data Plane</h1><p>The canonical repo-backed data plane for Ethereum upgrade intelligence: official EIPs, Forkcast curation, PM artifacts and agendas, Discord archive observations, Magicians links, snapshots, evals, search, and MCP.</p><div class="toolbar"><a class="button" href="/search.html">Search full corpus</a><a class="copy" href="/browser.html">Browse records</a><a class="copy" href="/admin/">Admin</a></div></div><div class="statline"><div class="stat"><strong>${manifest.record_count}</strong><span>canonical records</span></div><div class="stat"><strong>${eips.length}</strong><span>official EIPs</span></div><div class="stat"><strong>${searchDocs.length}</strong><span>search documents</span></div></div></section><section class="source-grid">${sourceRows}</section><section class="grid"><a class="item" href="/latest/catalog.json"><h3>Catalog JSON</h3><p>Top-level discovery contract for agents and static clients.</p></a><a class="item" href="/latest/stats.json"><h3>Corpus Stats</h3><p>${stats.artifact_count ?? 0} artifacts across ${Object.keys(stats.records_by_source ?? {}).length} source families.</p></a><a class="item" href="/latest/evals/results.json"><h3>Eval Gate</h3><p class="${evals.ok ? "ok" : "fail"}">${evals.ok ? "Passing" : "Failing"} fixture evals for search and traceability.</p></a></section>`));
  await writeText(join(distRoot, "search.html"), html("Forkcast Search", `<h1>Search</h1><p>Fast static search over EIPs, PM calls, TLDR/derived summaries, decisions, devnets, upgrades, Ethereum Magicians topics, and Discord archive observations. Press <span class="kbd">/</span> to focus search.</p><div class="toolbar"><input class="input" data-search-input placeholder="Search EIP-7702, Glamsterdam TLDR, BAL decisions, Discord channels, source paths" autofocus></div><div class="search-layout"><aside class="facets">${kindOptions}</aside><section><p class="quiet" data-search-count></p><div data-search-results>${searchDocs.slice(0, 12).map((doc) => `<article class="result"><h3><a href="${doc.url}">${doc.title}</a></h3><p>${doc.body.slice(0, 260)}</p><div class="badges"><span class="badge">${doc.kind}</span><span class="badge">${doc.citations[0]?.label ?? "source"}</span></div><p><a href="${doc.citations[0]?.url ?? doc.url}">source/provenance</a></p></article>`).join("")}</div></section></div>`));
  await writeText(join(distRoot, "browser.html"), html("Forkcast Data Browser", `<h1>Data Browser</h1><div class="grid"><a class="item" href="/latest/eips/index.json"><h3>EIPs</h3><p>${eips.length} official EIP read models enriched by Forkcast where available.</p></a><a class="item" href="/latest/calls/index.json"><h3>Calls</h3><p>${calls.length} PM/Forkcast call records with agendas, transcripts, TLDRs, and decisions.</p></a><a class="item" href="/latest/threads/index.json"><h3>Discord Archive</h3><p>${threads.length} archive day records from eth-rnd-archive.</p></a><a class="item" href="/latest/decisions/index.ndjson"><h3>Decisions</h3><p>Line-delimited decision stream for agents.</p></a><a class="item" href="/latest/topics/index.json"><h3>Magicians</h3><p>Ethereum Magicians source observations discovered from PM and EIP links.</p></a><a class="item" href="/snapshots/index.json"><h3>Snapshots</h3><p>Immutable snapshot index and latest pointer.</p></a></div><section class="split section"><div><h2>Recent Calls</h2><div class="list">${recentCalls}</div></div><div><h2>Recent Discord Observations</h2><div class="list">${recentThreads}</div></div></section>`));
  await writeText(join(distRoot, "snapshots.html"), html("Forkcast Snapshots", `<h1>Snapshots</h1><p>Latest snapshot: <code>${manifest.snapshot_id}</code></p><div class="grid"><a class="item" href="/latest/manifest.json"><h3>Latest Manifest</h3><p>Revalidating pointer.</p></a><a class="item" href="/snapshots/${manifest.snapshot_id}/manifest.json"><h3>Immutable Manifest</h3><p>Snapshot-pinned manifest.</p></a><a class="item" href="/snapshots/${manifest.snapshot_id}/catalog.json"><h3>Immutable Catalog</h3><p>Snapshot-pinned catalog.</p></a></div><pre>${JSON.stringify(manifest, null, 2)}</pre>`));
  await writeText(join(distRoot, "schemas.html"), html("Forkcast Schemas", `<h1>Schemas</h1><p>Stable contracts for records, catalogs, snapshots, read models, search documents, and agent integration.</p><div class="list"><a class="row" href="/schemas/record-manifest.schema.json">Record manifest schema</a><a class="row" href="/schemas/catalog.schema.json">Catalog schema</a><a class="row" href="/schemas/snapshot-manifest.schema.json">Snapshot manifest schema</a><a class="row" href="/examples/search-response.json">Search response example</a></div>`));
  const mcpConfig = JSON.stringify({ mcpServers: { forkcast: { command: "npx", args: ["tsx", "src/mcp/server.ts"], env: { FORKCAST_DATA_LATEST_ROOT: "/path/to/forkcast-data/dist/latest" } } } }, null, 2);
  await writeText(join(distRoot, "mcp.html"), html("Forkcast MCP", `<h1>MCP Setup</h1><p>Read-only tools: search_forkcast, get_upgrade, get_eip, get_call, get_decisions, get_devnet, trace_fact.</p><button class="copy" data-copy='${mcpConfig.replaceAll("'", "&apos;")}'>Copy config</button><pre>${mcpConfig}</pre><p><a href="/agent/codex-skill/SKILL.md">Codex skill artifact</a> · <a href="/agent/mcp-configs/claude_desktop_config.json">Claude config</a> · <a href="/agent/mcp-configs/gemini_mcp_config.json">Gemini config</a></p>`));
  await writeText(join(distRoot, "admin", "index.html"), html("Forkcast Admin", `<h1>Admin</h1><p class="locked">Function-level auth only. Public snapshots and search stay CDN-cacheable; rerun controls unlock only when admin auth and GitHub/Netlify secrets are configured.</p><form class="form" data-admin-form><label>Admin token<input class="input" name="token" autocomplete="off" placeholder="Bearer token value"></label><label>Password<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Password for ADMIN_PASSWORD_HASH"></label><button class="button" type="submit">Unlock</button></form><section class="split"><div><h2>Fixture Evals</h2><table class="table"><thead><tr><th>Case</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${evalRows}</tbody></table></div><div><h2>Corpus Health</h2><pre>${JSON.stringify({ snapshot: manifest.snapshot_id, records: manifest.record_count, eips: eips.length, calls: calls.length, threads: threads.length, evals: evals.ok }, null, 2)}</pre></div></section><section class="status-grid section"><div><h2>Live Admin API</h2><pre data-admin-status>Checking...</pre></div><div><h2>Rerun Controls</h2><div class="list" data-admin-controls><span class="pill">Checking secrets</span></div></div></section>`));
  await writeText(join(distRoot, "llms.txt"), `# Forkcast Data\n\nCanonical data plane: /latest/catalog.json\nLatest snapshot manifest: /latest/manifest.json\nMCP setup: /mcp.html\nSearch index: /latest/search/index.json\n`);
  await cp("schemas", join(distRoot, "schemas"), { recursive: true });
  await cp("agent", join(distRoot, "agent"), { recursive: true });
  await cp("examples", join(distRoot, "examples"), { recursive: true });
};
