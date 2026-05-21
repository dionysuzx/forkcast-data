import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeText } from "../lib/fs.js";
import type { CallReadModel, EipReadModel, SearchDocument, SnapshotManifest } from "../domain/types.js";

const SITE_ASSET_VERSION = "20260521-fast-search-v2";

const html = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css?v=${SITE_ASSET_VERSION}">
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
  <script type="module" src="/assets/site.js?v=${SITE_ASSET_VERSION}"></script>
</body>
</html>
`;

const css = `
:root{color-scheme:light;--bg:#f4f6f2;--fg:#121816;--muted:#5d6a64;--faint:#7d8982;--line:#d8ded7;--panel:#ffffff;--panel-soft:#eef3ef;--accent:#0f766e;--accent-dark:#0a4f49;--warn:#9a3412;--danger:#b91c1c;--ok:#047857;--shadow:0 18px 45px rgba(18,24,22,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#fbfcfa 0,#f4f6f2 360px);color:var(--fg);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}a{color:inherit}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 35%,transparent);outline-offset:3px}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:13px 24px;border-bottom:1px solid color-mix(in srgb,var(--line) 82%,transparent);background:rgba(251,252,250,.9);backdrop-filter:blur(14px)}
.brand{display:inline-flex;align-items:center;gap:9px;font-weight:760;text-decoration:none;white-space:nowrap}.brand:before{content:"";width:12px;height:18px;border-left:5px solid var(--fg);border-top:5px solid var(--fg);border-bottom:5px solid var(--fg);box-shadow:7px 5px 0 var(--accent)}
.topbar nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.topbar nav a{min-height:34px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;color:var(--muted);text-decoration:none;font-size:14px}.topbar nav a:hover{background:var(--panel-soft);color:var(--fg)}
main{max-width:1180px;margin:0 auto;padding:30px 22px 70px}.eyebrow{margin:0 0 10px;color:var(--accent-dark);font-size:12px;font-weight:760;letter-spacing:.08em;text-transform:uppercase}.lede{max-width:760px;color:var(--muted);font-size:18px}.page-header{margin:0 0 24px}.page-header h1,.home-hero h1{max-width:900px;margin:0;color:var(--fg);font-size:clamp(36px,5.4vw,68px);line-height:.98;letter-spacing:0;overflow-wrap:break-word}.page-header h1{font-size:clamp(32px,4.5vw,54px)}.page-header p{max-width:780px;color:var(--muted);font-size:17px}
.home-hero{display:grid;gap:22px;margin:8px 0 22px;padding:34px;border:1px solid var(--line);border-radius:8px;background:linear-gradient(135deg,#fff 0,#fff 58%,#edf5f1 100%);box-shadow:var(--shadow)}.home-hero p{margin:0}.home-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;max-width:920px;padding:8px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:8px;background:var(--panel)}.search-input,.input{width:100%;height:46px;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px;padding:0 13px;font:inherit}.search-input.large{height:58px;border:0;font-size:18px}.search-input::placeholder,.input::placeholder{color:#8a968e}.shortcut-row{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;color:var(--faint);font-size:13px}.kbd{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:23px;margin:0 2px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--panel);color:var(--muted);font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.query-chips,.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.chip,.button,.copy{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:6px;border:1px solid var(--line);padding:0 13px;font:inherit;text-decoration:none;cursor:pointer;white-space:nowrap}.button{background:var(--fg);border-color:var(--fg);color:#fff;font-weight:680}.button.secondary,.copy{background:var(--panel);color:var(--fg);border-color:var(--line)}.button:hover,.copy:hover,.chip:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(18,24,22,.08)}.chip{background:color-mix(in srgb,var(--accent) 8%,#fff);color:var(--accent-dark);border-color:color-mix(in srgb,var(--accent) 22%,var(--line))}
.metric-strip,.source-grid,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.source-grid{grid-template-columns:repeat(4,minmax(0,1fr));margin:18px 0 0}.stat,.metric,.item,.surface{min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:16px}.stat strong,.metric strong{display:block;font-size:30px;line-height:1.05}.stat span,.metric span,.item p,.quiet{color:var(--muted)}.item{text-decoration:none}.item h3{margin:0 0 8px;font-size:16px}.item p{margin:0}.item:hover{border-color:color-mix(in srgb,var(--accent) 36%,var(--line));box-shadow:0 10px 26px rgba(18,24,22,.07)}
.section{margin-top:34px}.list{display:grid;gap:9px}.row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding:11px 0;overflow-wrap:anywhere}.row small{color:var(--muted)}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;overflow:auto}pre{border:1px solid var(--line);background:#fbfcfa;border-radius:8px;padding:16px;overflow:auto;max-width:100%;font-size:13px}code,pre,.badge,.result a{overflow-wrap:anywhere}
.search-panel{display:grid;gap:12px;margin-bottom:18px;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:0 10px 28px rgba(18,24,22,.05)}.search-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;align-items:start}.search-layout>section{min-width:0}.facets{position:sticky;top:78px;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:10px}.facet{display:flex;width:100%;justify-content:space-between;gap:10px;border:0;background:transparent;color:var(--fg);padding:9px;border-radius:6px;text-align:left;cursor:pointer}.facet[aria-pressed=true],.facet:hover{background:color-mix(in srgb,var(--accent) 10%,transparent)}.result{min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:15px;overflow-wrap:anywhere}.result+.result{margin-top:10px}.result h3{margin:0 0 6px;font-size:18px}.result p{margin:0 0 10px;color:var(--muted)}.badges{display:flex;gap:6px;flex-wrap:wrap}.badge,.pill{display:inline-flex;align-items:center;min-height:24px;border:1px solid var(--line);border-radius:999px;padding:2px 9px;color:var(--muted);font-size:12px}
.split,.status-grid,.mcp-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.split>*,.status-grid>*,.mcp-layout>*{min-width:0}.mcp-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.locked{border-left:4px solid var(--warn);padding-left:14px}.form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:10px;margin:18px 0}.control{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:14px}.control button:disabled{opacity:.48;cursor:not-allowed}.table{width:100%;border-collapse:collapse;table-layout:fixed}.table th,.table td{border-bottom:1px solid var(--line);padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.table th{color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase}.ok{color:var(--ok)}.fail{color:var(--danger)}label{display:grid;gap:5px;color:var(--muted);font-size:13px}label input{font:inherit;color:var(--fg)}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:900px){main{padding:24px 16px 58px}.topbar{align-items:flex-start;flex-direction:column;padding:13px 16px}.topbar nav{width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}.home-hero{padding:24px}.home-search{grid-template-columns:1fr;min-width:0}.search-input.large{height:52px;font-size:16px}.metric-strip,.source-grid,.grid,.search-layout,.split,.status-grid,.mcp-layout,.form{grid-template-columns:1fr}.facets{position:static}.row,.control,.mcp-toolbar{flex-direction:column;align-items:flex-start}.page-header h1,.home-hero h1{font-size:34px;line-height:1.04}.button,.copy,.chip{width:auto;white-space:normal;text-align:center}}
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
const queryParam=(query)=>query?'/search.html?q='+encodeURIComponent(query):'/search.html';
const focusSearch=()=>{
  const input=document.querySelector('[data-search-input], [data-home-search]');
  if(!input){window.location.href='/search.html';return false;}
  input.focus();
  if(typeof input.select==='function')input.select();
  return true;
};
document.querySelectorAll('[data-home-search-form]').forEach((form)=>form.addEventListener('submit',(event)=>{
  event.preventDefault();
  const input=form.querySelector('[data-home-search]');
  window.location.href=queryParam(String(input?.value||'').trim());
}));
document.querySelectorAll('[data-query]').forEach((button)=>button.addEventListener('click',()=>{
  window.location.href=queryParam(button.getAttribute('data-query')||'');
}));
const handleSearchHotkey=(event)=>{
  if(event.defaultPrevented)return;
  const active=document.activeElement;
  const typing=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable);
  if((event.key==='/'&&!typing)||((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k')){
    event.preventDefault();
    focusSearch();
  }
  if(event.key==='Escape'&&active&&active.matches&&active.matches('[data-search-input], [data-home-search]')){
    active.blur();
  }
};
document.addEventListener('keydown',handleSearchHotkey,true);
window.addEventListener('keydown',handleSearchHotkey);
const searchInput=document.querySelector('[data-search-input]');
const results=document.querySelector('[data-search-results]');
const count=document.querySelector('[data-search-count]');
const facets=[...document.querySelectorAll('[data-search-kind]')];
if(searchInput&&results){
  let activeKind='all',meta=null,requestSeq=0,fallbackDocs=null;
  const termCache=new Map(),docShardCache=new Map();
  const shardName=(index)=>String(index).padStart(4,'0')+'.json';
  const termShard=(term)=>(String(term).match(/^[a-z0-9]{1,2}/)?.[0]||'zz').padEnd(2,'_')+'.json';
  const expandDoc=(doc)=>({n:doc.n,id:doc.id,kind:doc.k,title:doc.t,body:doc.b,url:doc.u,citations:doc.c,tags:doc.g});
  const loadJson=async(url)=>{const res=await fetch(url);if(!res.ok)throw new Error('Unable to load '+url);return res.json();};
  const loadMeta=async()=>meta||(meta=await loadJson('/latest/search/fast/meta.json'));
  const loadTermShard=async(shard)=>{if(!termCache.has(shard))termCache.set(shard,loadJson('/latest/search/fast/terms/'+shard));return termCache.get(shard);};
  const loadDocShard=async(shard)=>{if(!docShardCache.has(shard))docShardCache.set(shard,loadJson('/latest/search/fast/docs/'+shard));return docShardCache.get(shard);};
  const postingsForTerm=async(term)=>{
    const shard=await loadTermShard(termShard(term));
    const exact=shard[term]||[];
    if(exact.length||term.length<3)return exact;
    return Object.entries(shard).filter(([candidate])=>candidate.startsWith(term)).flatMap(([,postings])=>postings).slice(0,1200);
  };
  const loadDocs=async(ids,docShardSize)=>{
    const wanted=new Set(ids);
    const shards=[...new Set(ids.map((id)=>shardName(Math.floor(id/docShardSize))))];
    const docs=[];
    for(const shardDocs of await Promise.all(shards.map((shard)=>loadDocShard(shard)))){
      for(const doc of shardDocs){
        if(wanted.has(doc.n))docs.push(expandDoc(doc));
      }
    }
    return docs;
  };
  const runFallback=async(query,queryTerms)=>{
    fallbackDocs=fallbackDocs||await loadJson('/latest/search/index.json');
    const scoped=activeKind==='all'?fallbackDocs:fallbackDocs.filter((doc)=>doc.kind===activeKind);
    const hits=(queryTerms.length?scoped.map((d)=>({d,score:scoreDoc(d,query,queryTerms)})).filter((hit)=>hit.score>0):scoped.slice(0,40).map((d)=>({d,score:1}))).sort((a,b)=>b.score-a.score||a.d.title.localeCompare(b.d.title)).slice(0,40);
    if(count)count.textContent=hits.length+' results from '+scoped.length+' '+activeKind+' docs';
    results.innerHTML=hits.map((hit)=>resultMarkup(hit,queryTerms)).join('')||'<p>No matches. Try an EIP number, call series, TLDR phrase, Discord channel, or source name.</p>';
  };
  const run=async()=>{
    const seq=++requestSeq;
    const query=searchInput.value;
    const queryTerms=terms(query);
    try{
      const fastMeta=await loadMeta();
      const scopedTotal=activeKind==='all'?fastMeta.doc_count:(fastMeta.kinds?.[activeKind]||0);
      if(!queryTerms.length){
        if(count)count.textContent='Showing featured results from '+scopedTotal+' '+activeKind+' docs';
        return;
      }
      if(count)count.textContent='Searching '+scopedTotal+' '+activeKind+' docs...';
      const scores=new Map();
      for(const postings of await Promise.all(queryTerms.map((term)=>postingsForTerm(term)))){
        for(const [docId,score] of postings){
          scores.set(docId,(scores.get(docId)||0)+score);
        }
      }
      if(seq!==requestSeq)return;
      const rankedIds=[...scores.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,activeKind==='all'?40:500).map(([id])=>id);
      const docs=await loadDocs(rankedIds,fastMeta.doc_shard_size);
      const exact=eipNumber(query),phrase=String(query||'').trim().toLowerCase();
      const hits=docs.map((d)=>({
        d,
        score:(scores.get(d.n)||0)
          +(exact&&(d.id==='eip-'+exact||String(d.title).toLowerCase().includes('eip-'+exact)||String((d.tags||[]).join(' ')).toLowerCase().includes('eip-'+exact))?250:0)
          +(phrase.length>3&&(String(d.title).toLowerCase().includes(phrase)||String((d.tags||[]).join(' ')).toLowerCase().includes(phrase))?40:0)
          +(queryTerms.includes('eip')&&d.kind==='eip'?20:0)
      })).filter((hit)=>hit.score>0&&(activeKind==='all'||hit.d.kind===activeKind)).sort((a,b)=>b.score-a.score||a.d.title.localeCompare(b.d.title)).slice(0,40);
      if(seq!==requestSeq)return;
      if(count)count.textContent=hits.length+' fast results from '+scopedTotal+' '+activeKind+' docs';
      results.innerHTML=hits.map((hit)=>resultMarkup(hit,queryTerms)).join('')||'<p>No matches. Try an EIP number, call series, TLDR phrase, Discord channel, or source name.</p>';
    }catch{
      await runFallback(query,queryTerms);
    }
  };
  const initialQuery=new URLSearchParams(window.location.search).get('q');
  if(initialQuery)searchInput.value=initialQuery;
  let debounce;
  searchInput.addEventListener('input',()=>{window.clearTimeout(debounce);debounce=window.setTimeout(run,80);});
  facets.forEach((button)=>button.addEventListener('click',()=>{activeKind=button.getAttribute('data-search-kind')||'all';facets.forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));run();}));
  run();
}
document.querySelectorAll('[data-copy-target]').forEach((btn)=>btn.addEventListener('click',async()=>{
  const original=btn.textContent;
  const target=document.querySelector(btn.getAttribute('data-copy-target')||'');
  try{
    await navigator.clipboard.writeText(target?.textContent||'');
    btn.textContent='Copied';
  }catch{
    btn.textContent='Copy failed';
  }
  window.setTimeout(()=>{btn.textContent=original||'Copy';},1600);
}));
document.querySelectorAll('[data-copy]').forEach((btn)=>btn.addEventListener('click',async()=>{
  const original=btn.textContent;
  try{
    await navigator.clipboard.writeText(btn.getAttribute('data-copy')||'');
    btn.textContent='Copied';
  }catch{
    btn.textContent='Copy failed';
  }
  window.setTimeout(()=>{btn.textContent=original||'Copy';},1600);
}));
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
  await writeText(join(distRoot, "index.html"), html("Forkcast Data", `<section class="home-hero"><p class="eyebrow">Canonical Ethereum upgrade intelligence</p><h1>Search the Forkcast data plane.</h1><p class="lede">Repo-backed records, official EIPs, PM calls, Forkcast summaries, Discord archive observations, Magicians references, snapshots, evals, and provenance live behind one fast corpus search.</p><form class="home-search" data-home-search-form action="/search.html"><label class="visually-hidden" for="home-search">Search full corpus</label><input id="home-search" class="search-input large" name="q" data-home-search placeholder="Search EIP-7702, Glamsterdam TLDR, BAL decisions, Discord channels"><button class="button" type="submit">Search</button></form><div class="shortcut-row"><span><span class="kbd">/</span> focus search</span><span><span class="kbd">Ctrl</span><span class="kbd">K</span> command search</span><span><span class="kbd">Esc</span> leave search</span></div><div class="query-chips" aria-label="Example searches"><button class="chip" type="button" data-query="EIP-7702">EIP-7702</button><button class="chip" type="button" data-query="Glamsterdam TLDR">Glamsterdam TLDR</button><button class="chip" type="button" data-query="BAL decisions">BAL decisions</button><button class="chip" type="button" data-query="SFI">SFI moves</button></div></section><section class="metric-strip" aria-label="Corpus status"><div class="stat"><strong>${manifest.record_count}</strong><span>canonical records</span></div><div class="stat"><strong>${eips.length}</strong><span>official EIPs</span></div><div class="stat"><strong>${searchDocs.length}</strong><span>search documents</span></div></section><section class="source-grid" aria-label="Source coverage">${sourceRows}</section><section class="grid section"><a class="item" href="/latest/catalog.json"><h3>Catalog JSON</h3><p>Top-level discovery contract for agents and static clients.</p></a><a class="item" href="/latest/stats.json"><h3>Corpus Stats</h3><p>${stats.artifact_count ?? 0} artifacts across ${Object.keys(stats.records_by_source ?? {}).length} source families.</p></a><a class="item" href="/latest/evals/results.json"><h3>Eval Gate</h3><p class="${evals.ok ? "ok" : "fail"}">${evals.ok ? "Passing" : "Failing"} fixture evals for search and traceability.</p></a></section>`));
  await writeText(join(distRoot, "search.html"), html("Forkcast Search", `<section class="page-header"><p class="eyebrow">Corpus search</p><h1>Find calls, EIPs, decisions, TLDRs, and provenance.</h1><p>Static index search over EIPs, PM calls, derived summaries, decisions, devnets, upgrades, Ethereum Magicians topics, and Discord archive observations.</p></section><section class="search-panel"><label class="visually-hidden" for="corpus-search">Search full corpus</label><input id="corpus-search" class="search-input large" data-search-input placeholder="Search EIP-7702, Glamsterdam TLDR, BAL decisions, Discord channels, source paths" autofocus><div class="shortcut-row"><span><span class="kbd">/</span> focus</span><span><span class="kbd">Ctrl</span><span class="kbd">K</span> command search</span><span><span class="kbd">Esc</span> leave search</span></div></section><div class="search-layout"><aside class="facets" aria-label="Search filters">${kindOptions}</aside><section><p class="quiet" data-search-count></p><div data-search-results>${searchDocs.slice(0, 12).map((doc) => `<article class="result"><h3><a href="${doc.url}">${doc.title}</a></h3><p>${doc.body.slice(0, 260)}</p><div class="badges"><span class="badge">${doc.kind}</span><span class="badge">${doc.citations[0]?.label ?? "source"}</span></div><p><a href="${doc.citations[0]?.url ?? doc.url}">source/provenance</a></p></article>`).join("")}</div></section></div>`));
  await writeText(join(distRoot, "browser.html"), html("Forkcast Data Browser", `<section class="page-header"><p class="eyebrow">Data browser</p><h1>Canonical files first, human pages second.</h1><p>Browse stable JSON, Markdown, NDJSON, and manifests generated from the same snapshot that powers search and MCP.</p></section><div class="grid"><a class="item" href="/latest/eips/index.json"><h3>EIPs</h3><p>${eips.length} official EIP read models enriched by Forkcast where available.</p></a><a class="item" href="/latest/calls/index.json"><h3>Calls</h3><p>${calls.length} PM/Forkcast call records with agendas, transcripts, TLDRs, and decisions.</p></a><a class="item" href="/latest/threads/index.json"><h3>Discord Archive</h3><p>${threads.length} archive day records from eth-rnd-archive.</p></a><a class="item" href="/latest/decisions/index.ndjson"><h3>Decisions</h3><p>Line-delimited decision stream for agents.</p></a><a class="item" href="/latest/topics/index.json"><h3>Magicians</h3><p>Ethereum Magicians source observations discovered from PM and EIP links.</p></a><a class="item" href="/snapshots/index.json"><h3>Snapshots</h3><p>Immutable snapshot index and latest pointer.</p></a></div><section class="split section"><div class="surface"><h2>Recent Calls</h2><div class="list">${recentCalls}</div></div><div class="surface"><h2>Recent Discord Observations</h2><div class="list">${recentThreads}</div></div></section>`));
  await writeText(join(distRoot, "snapshots.html"), html("Forkcast Snapshots", `<section class="page-header"><p class="eyebrow">Snapshots</p><h1>Immutable releases with latest pointers.</h1><p>Latest snapshot: <code>${manifest.snapshot_id}</code></p></section><div class="grid"><a class="item" href="/latest/manifest.json"><h3>Latest Manifest</h3><p>Revalidating pointer.</p></a><a class="item" href="/snapshots/${manifest.snapshot_id}/manifest.json"><h3>Immutable Manifest</h3><p>Snapshot-pinned manifest.</p></a><a class="item" href="/snapshots/${manifest.snapshot_id}/catalog.json"><h3>Immutable Catalog</h3><p>Snapshot-pinned catalog.</p></a></div><section class="section"><pre>${JSON.stringify(manifest, null, 2)}</pre></section>`));
  await writeText(join(distRoot, "schemas.html"), html("Forkcast Schemas", `<section class="page-header"><p class="eyebrow">Schemas and examples</p><h1>Contracts agents can pin and validate.</h1><p>Stable contracts for records, catalogs, snapshots, read models, search documents, and agent integration.</p></section><div class="list surface"><a class="row" href="/schemas/record-manifest.schema.json">Record manifest schema</a><a class="row" href="/schemas/catalog.schema.json">Catalog schema</a><a class="row" href="/schemas/snapshot-manifest.schema.json">Snapshot manifest schema</a><a class="row" href="/examples/search-response.json">Search response example</a></div>`));
  const mcpConfig = JSON.stringify({ mcpServers: { forkcast: { command: "npx", args: ["tsx", "src/mcp/server.ts"], env: { FORKCAST_DATA_LATEST_ROOT: "/path/to/forkcast-data/dist/latest" } } } }, null, 2);
  await writeText(join(distRoot, "mcp.html"), html("Forkcast MCP", `<section class="page-header"><p class="eyebrow">Agent setup</p><h1>Read-only MCP over the snapshot corpus.</h1><p>Tools: search_forkcast, get_upgrade, get_eip, get_call, get_decisions, get_devnet, and trace_fact. Every response links back to canonical files and provenance.</p></section><section class="mcp-layout"><div class="surface"><div class="mcp-toolbar"><div><h2>Local MCP config</h2><p class="quiet">Use this with Codex, Claude Desktop, Claude Code, Gemini, or any generic MCP client.</p></div><button class="button secondary" type="button" data-copy-target="#mcp-config-code">Copy config</button></div><pre id="mcp-config-code">${mcpConfig}</pre></div><div class="surface"><h2>Agent artifacts</h2><div class="list"><a class="row" href="/agent/codex-skill/SKILL.md">Codex skill artifact</a><a class="row" href="/agent/mcp-configs/claude_desktop_config.json">Claude config</a><a class="row" href="/agent/mcp-configs/gemini_mcp_config.json">Gemini config</a><a class="row" href="/llms.txt">llms.txt</a></div></div></section>`));
  await writeText(join(distRoot, "admin", "index.html"), html("Forkcast Admin", `<section class="page-header"><p class="eyebrow">Operations</p><h1>Pipeline status, evals, and guarded reruns.</h1><p class="locked">Function-level auth only. Public snapshots and search stay CDN-cacheable; rerun controls unlock only when admin auth and GitHub/Netlify secrets are configured.</p></section><form class="form" data-admin-form><label>Admin token<input class="input" name="token" autocomplete="off" placeholder="Bearer token value"></label><label>Password<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Password for ADMIN_PASSWORD_HASH"></label><button class="button" type="submit">Unlock</button></form><section class="split"><div class="surface"><h2>Fixture Evals</h2><table class="table"><thead><tr><th>Case</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${evalRows}</tbody></table></div><div class="surface"><h2>Corpus Health</h2><pre>${JSON.stringify({ snapshot: manifest.snapshot_id, records: manifest.record_count, eips: eips.length, calls: calls.length, threads: threads.length, evals: evals.ok }, null, 2)}</pre></div></section><section class="status-grid section"><div class="surface"><h2>Live Admin API</h2><pre data-admin-status>Checking...</pre></div><div class="surface"><h2>Rerun Controls</h2><div class="list" data-admin-controls><span class="pill">Checking secrets</span></div></div></section>`));
  await writeText(join(distRoot, "llms.txt"), `# Forkcast Data\n\nCanonical data plane: /latest/catalog.json\nLatest snapshot manifest: /latest/manifest.json\nMCP setup: /mcp.html\nSearch index: /latest/search/index.json\n`);
  await cp("schemas", join(distRoot, "schemas"), { recursive: true });
  await cp("agent", join(distRoot, "agent"), { recursive: true });
  await cp("examples", join(distRoot, "examples"), { recursive: true });
};
