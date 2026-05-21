import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";
import type { SearchDocument } from "../domain/types.js";
import { listFiles, nowIso, readJson, writeJson, writeText } from "../lib/fs.js";

export interface SearchResult {
  id: string;
  title: string;
  body: string;
  url: string;
  score: number;
  citations: SearchDocument["citations"];
  tags: string[];
}

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

type FastSearchDoc = {
  n: number;
  id: string;
  k: SearchDocument["kind"];
  t: string;
  b: string;
  u: string;
  c: SearchDocument["citations"];
  g: string[];
};

const DOC_SHARD_SIZE = 128;
const MAX_POSTINGS_PER_TERM = 2000;

const compactBody = (value: string, max = 700): string =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

const shardName = (index: number): string =>
  `${String(index).padStart(4, "0")}.json`;

const termShard = (term: string): string =>
  `${(term.match(/^[a-z0-9]{1,2}/)?.[0] ?? "zz").padEnd(2, "_")}.json`;

const addWeightedTerms = (
  target: Map<string, number>,
  value: string,
  weight: number,
  cap: number
): void => {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  for (const [term, count] of counts) {
    target.set(term, (target.get(term) ?? 0) + Math.min(count, cap) * weight);
  }
};

const buildFastSearchIndex = async (latestRoot: string, docs: SearchDocument[]): Promise<void> => {
  const fastRoot = join(latestRoot, "search", "fast");
  await rm(fastRoot, { recursive: true, force: true });

  const docShards = new Map<number, FastSearchDoc[]>();
  const termShards = new Map<string, Map<string, Map<number, number>>>();
  const kinds: Record<string, number> = {};

  docs.forEach((doc, index) => {
    kinds[doc.kind] = (kinds[doc.kind] ?? 0) + 1;
    const docShardIndex = Math.floor(index / DOC_SHARD_SIZE);
    const slimDoc: FastSearchDoc = {
      n: index,
      id: doc.id,
      k: doc.kind,
      t: doc.title,
      b: compactBody(doc.body),
      u: doc.url,
      c: doc.citations.slice(0, 3),
      g: doc.tags.slice(0, 8)
    };
    docShards.set(docShardIndex, [...(docShards.get(docShardIndex) ?? []), slimDoc]);

    const weightedTerms = new Map<string, number>();
    addWeightedTerms(weightedTerms, doc.title, 12, 8);
    addWeightedTerms(weightedTerms, doc.tags.join(" "), 8, 8);
    addWeightedTerms(weightedTerms, doc.body, 1, 10);
    for (const [term, score] of weightedTerms) {
      const shard = termShard(term);
      const shardTerms = termShards.get(shard) ?? new Map<string, Map<number, number>>();
      const postings = shardTerms.get(term) ?? new Map<number, number>();
      postings.set(index, score);
      shardTerms.set(term, postings);
      termShards.set(shard, shardTerms);
    }
  });

  await writeText(join(fastRoot, "meta.json"), `${JSON.stringify({
    version: 1,
    generated_at: nowIso(),
    doc_count: docs.length,
    doc_shard_size: DOC_SHARD_SIZE,
    max_postings_per_term: MAX_POSTINGS_PER_TERM,
    kinds
  })}\n`);

  for (const [index, shardDocs] of docShards) {
    await writeText(join(fastRoot, "docs", shardName(index)), `${JSON.stringify(shardDocs)}\n`);
  }

  for (const [shard, terms] of termShards) {
    const payload: Record<string, Array<[number, number]>> = {};
    for (const [term, postings] of terms) {
      payload[term] = [...postings.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, MAX_POSTINGS_PER_TERM);
    }
    await writeText(join(fastRoot, "terms", shard), `${JSON.stringify(payload)}\n`);
  }
};

const scoreDocument = (doc: SearchDocument, query: string, terms: string[]): number => {
  const titleText = doc.title.toLowerCase();
  const tagText = doc.tags.join(" ").toLowerCase();
  const exactEip = eipNumberFromQuery(query);
  const title = tokenize(doc.title);
  const tags = tokenize(doc.tags.join(" "));
  const body = tokenize(doc.body);
  const termScore = terms.reduce((sum, term) => (
    sum +
    countMatches(title, term, 8) * 12 +
    countMatches(tags, term, 8) * 8 +
    countMatches(body, term, 10)
  ), 0);
  const exactEipScore =
    exactEip && (doc.id === `eip-${exactEip}` || titleText.includes(`eip-${exactEip}`) || tagText.includes(`eip-${exactEip}`))
      ? 250
      : 0;
  const phrase = query.trim().toLowerCase();
  const phraseScore = phrase.length > 3 && (titleText.includes(phrase) || tagText.includes(phrase)) ? 40 : 0;
  const kindScore = terms.includes("eip") && doc.kind === "eip" ? 20 : 0;
  return termScore + exactEipScore + phraseScore + kindScore;
};

export const buildSearchIndex = async (latestRoot: string): Promise<SearchDocument[]> => {
  const docs: SearchDocument[] = [];
  const eips = await readJson<Array<{ id: number; title: string; status: string; category?: string; type?: string; summary: string; impacts?: string[]; canonical_url: string; citations: SearchDocument["citations"] }>>(join(latestRoot, "eips", "index.json")).catch(() => []);
  for (const eip of eips) {
    docs.push({
      id: `eip-${eip.id}`,
      kind: "eip",
      title: eip.title,
      body: `${eip.summary} ${(eip.impacts ?? []).join(" ")}`,
      url: eip.canonical_url,
      citations: eip.citations,
      tags: [`EIP-${eip.id}`, "eip", eip.status, eip.category ?? "", eip.type ?? ""].filter(Boolean)
    });
  }
  const calls = await readJson<Array<{ id: string; title: string; summary: string; canonical_json_url: string; citations: SearchDocument["citations"]; decisions: Array<{ title: string }> }>>(join(latestRoot, "calls", "index.json")).catch(() => []);
  for (const call of calls) {
    docs.push({ id: call.id, kind: "call", title: call.title, body: `${call.summary} ${call.decisions.map((decision) => decision.title).join(" ")}`, url: call.canonical_json_url, citations: call.citations, tags: ["call"] });
  }
  const decisionsText = await import("node:fs/promises").then((fs) => fs.readFile(join(latestRoot, "decisions", "index.ndjson"), "utf8")).catch(() => "");
  for (const line of decisionsText.split("\n").filter(Boolean)) {
    const decision = JSON.parse(line) as { id: string; title: string; canonical_url: string; citations: SearchDocument["citations"] };
    docs.push({ id: decision.id, kind: "decision", title: decision.title, body: decision.title, url: decision.canonical_url, citations: decision.citations, tags: ["decision"] });
  }
  const threads = await readJson<Array<{ id: string; title: string; summary: string; channel?: string; date?: string; message_count?: number; canonical_json_url: string; citations: SearchDocument["citations"] }>>(join(latestRoot, "threads", "index.json")).catch(() => []);
  for (const thread of threads) {
    docs.push({
      id: thread.id,
      kind: "thread",
      title: thread.title,
      body: `${thread.summary} ${thread.channel ?? ""} ${thread.date ?? ""} ${thread.message_count ?? ""}`,
      url: thread.canonical_json_url,
      citations: thread.citations,
      tags: ["discord", "thread", thread.channel ?? "", thread.date ?? ""].filter(Boolean)
    });
  }
  const topics = await readJson<Array<{ id: string; title: string; summary?: string; canonical_json_url: string; citations: SearchDocument["citations"] }>>(join(latestRoot, "topics", "index.json")).catch(() => []);
  for (const topic of topics) {
    const isPmLegacy = topic.id.startsWith("pm-legacy/");
    docs.push({
      id: topic.id,
      kind: "topic",
      title: topic.title,
      body: topic.summary ?? topic.title,
      url: topic.canonical_json_url,
      citations: topic.citations,
      tags: [isPmLegacy ? "pm-legacy" : "ethereum-magicians", "topic"]
    });
  }
  for (const dir of ["upgrades", "devnets"]) {
    const root = join(latestRoot, dir);
    const files = await listFiles(root).catch(() => []);
    for (const file of files.filter((entry) => entry.endsWith(".json") && !entry.endsWith("index.json"))) {
      const data = await readJson<{ id?: string; title?: string; metadata?: unknown; data?: unknown; canonical_url?: string; citations?: SearchDocument["citations"] }>(file);
      const id = data.id ?? file;
      docs.push({
        id,
        kind: dir === "upgrades" ? "upgrade" : "devnet",
        title: data.title ?? id,
        body: JSON.stringify(data.metadata ?? data.data ?? {}).slice(0, 6000),
        url: data.canonical_url ?? `/latest/${dir}/${file.slice(root.length + 1)}`,
        citations: data.citations ?? [],
        tags: [dir.slice(0, -1), dir]
      });
    }
  }
  const distRoot = dirname(latestRoot);
  const recordFiles = await listFiles(join(distRoot, "records")).catch(() => []);
  for (const file of recordFiles.filter((entry) => /\/derived\/(tldr|call-intelligence|brief)\.json$/.test(entry))) {
    const body = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8")).catch(() => "");
    const id = file.slice(join(distRoot, "records").length + 1).replace(/\/derived\/.*$/, "").replaceAll("/", ":");
    docs.push({
      id: `artifact:${id}`,
      kind: "topic",
      title: `Derived artifact ${id}`,
      body: body.slice(0, 8000),
      url: `/${file.slice(distRoot.length + 1)}`,
      citations: [{ recordId: id, artifactPath: file.split("/records/")[1] ?? file, url: `/${file.slice(distRoot.length + 1)}`, label: "derived artifact" }],
      tags: ["derived", "tldr", "summary", "provenance"]
    });
  }
  await writeJson(join(latestRoot, "search", "index.json"), docs);
  await buildFastSearchIndex(latestRoot, docs);
  return docs;
};

export const searchDocuments = (docs: SearchDocument[], query: string, limit = 10): SearchResult[] => {
  const terms = tokenize(query);
  if (!terms.length) return [];
  return docs
    .map((doc) => {
      const score = scoreDocument(doc, query, terms);
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
    .map(({ doc, score }) => ({ id: doc.id, title: doc.title, body: doc.body, url: doc.url, score, citations: doc.citations, tags: doc.tags }));
};
