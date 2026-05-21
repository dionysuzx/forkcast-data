import type { Config } from "@netlify/functions";

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "changed",
  "does",
  "find",
  "for",
  "from",
  "in",
  "involving",
  "is",
  "of",
  "on",
  "recent",
  "the",
  "this",
  "to",
  "trace",
  "what",
  "week",
  "which",
  "with"
]);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !stopwords.has(token));

const countMatches = (tokens: string[], term: string, cap: number): number =>
  Math.min(tokens.filter((token) => token.includes(term)).length, cap);

const eipNumberFromQuery = (query: string): string | undefined =>
  query.match(/\beip[-\s]?(\d+)\b/i)?.[1];

type FastDoc = {
  n: number;
  id: string;
  k: string;
  t: string;
  b: string;
  u: string;
  c: unknown[];
  g: string[];
};

type FastMeta = {
  doc_count: number;
  doc_shard_size: number;
  kinds: Record<string, number>;
};

type SearchCache = {
  json: Map<string, Promise<unknown>>;
};

const cache = (globalThis as typeof globalThis & { __forkcastSearchCache?: SearchCache }).__forkcastSearchCache ??= {
  json: new Map()
};

const loadJson = async <T>(url: URL): Promise<T> => {
  const key = url.toString();
  if (!cache.json.has(key)) {
    cache.json.set(key, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${key}`);
      return response.json() as Promise<unknown>;
    }));
  }
  return cache.json.get(key) as Promise<T>;
};

const shardName = (index: number): string =>
  `${String(index).padStart(4, "0")}.json`;

const termShard = (term: string): string =>
  `${(term.match(/^[a-z0-9]{1,2}/)?.[0] ?? "zz").padEnd(2, "_")}.json`;

const expandDoc = (doc: FastDoc) => ({
  id: doc.id,
  kind: doc.k,
  title: doc.t,
  body: doc.b,
  url: doc.u,
  citations: doc.c,
  tags: doc.g
});

const scoreExpandedDoc = (
  doc: ReturnType<typeof expandDoc>,
  baseScore: number,
  query: string,
  terms: string[]
): number => {
  const exactEip = eipNumberFromQuery(query);
  const titleText = doc.title.toLowerCase();
  const tagText = doc.tags.join(" ").toLowerCase();
  const phrase = query.trim().toLowerCase();
  return (
    baseScore +
    (exactEip && (doc.id === `eip-${exactEip}` || titleText.includes(`eip-${exactEip}`) || tagText.includes(`eip-${exactEip}`)) ? 250 : 0) +
    (phrase.length > 3 && (titleText.includes(phrase) || tagText.includes(phrase)) ? 40 : 0) +
    (terms.includes("eip") && doc.kind === "eip" ? 20 : 0)
  );
};

export default async (request: Request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const terms = tokenize(query);
  const kind = url.searchParams.get("kind");
  if (!terms.length) {
    return Response.json({ query, results: [] }, {
      headers: {
        "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        "Cache-Control": "public, max-age=0, must-revalidate"
      }
    });
  }

  const meta = await loadJson<FastMeta>(new URL("/latest/search/fast/meta.json", request.url));
  const scores = new Map<number, number>();
  for (const term of terms) {
    const shard = await loadJson<Record<string, Array<[number, number]>>>(new URL(`/latest/search/fast/terms/${termShard(term)}`, request.url));
    const exact = shard[term] ?? [];
    const postings = exact.length || term.length < 3
      ? exact
      : Object.entries(shard).filter(([candidate]) => candidate.startsWith(term)).flatMap(([, values]) => values).slice(0, 1200);
    for (const [docId, score] of postings) {
      scores.set(docId, (scores.get(docId) ?? 0) + score);
    }
  }

  const rankedIds = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, kind && kind !== "all" ? 500 : 40).map(([id]) => id);
  const wanted = new Set(rankedIds);
  const docShardNames = [...new Set(rankedIds.map((id) => shardName(Math.floor(id / meta.doc_shard_size))))];
  const docs: FastDoc[] = [];
  for (const shard of docShardNames) {
    const shardDocs = await loadJson<FastDoc[]>(new URL(`/latest/search/fast/docs/${shard}`, request.url));
    docs.push(...shardDocs.filter((doc) => wanted.has(doc.n)));
  }

  const results = docs
    .map((doc) => {
      const expanded = expandDoc(doc);
      return { doc: expanded, score: scoreExpandedDoc(expanded, scores.get(doc.n) ?? 0, query, terms) };
    })
    .filter((entry) => entry.score > 0 && (!kind || kind === "all" || entry.doc.kind === kind))
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, 10)
    .map((entry) => entry.doc);
  return Response.json({ query, results }, {
    headers: {
      "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      "Cache-Control": "public, max-age=0, must-revalidate"
    }
  });
};

export const config: Config = {
  path: "/api/search"
};
