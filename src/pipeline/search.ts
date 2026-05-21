import { join } from "node:path";
import type { SearchDocument } from "../domain/types.js";
import { readJson, writeJson } from "../lib/fs.js";

export interface SearchResult {
  id: string;
  title: string;
  body: string;
  url: string;
  score: number;
  citations: SearchDocument["citations"];
  tags: string[];
}

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);

export const buildSearchIndex = async (latestRoot: string): Promise<SearchDocument[]> => {
  const docs: SearchDocument[] = [];
  const eips = await readJson<Array<{ id: number; title: string; summary: string; canonical_url: string; citations: SearchDocument["citations"] }>>(join(latestRoot, "eips", "index.json")).catch(() => []);
  for (const eip of eips) {
    docs.push({ id: `eip-${eip.id}`, kind: "eip", title: eip.title, body: eip.summary, url: eip.canonical_url, citations: eip.citations, tags: [`EIP-${eip.id}`, "eip"] });
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
  await writeJson(join(latestRoot, "search", "index.json"), docs);
  return docs;
};

export const searchDocuments = (docs: SearchDocument[], query: string, limit = 10): SearchResult[] => {
  const terms = tokenize(query);
  if (!terms.length) return [];
  return docs
    .map((doc) => {
      const haystack = tokenize(`${doc.title} ${doc.body} ${doc.tags.join(" ")}`);
      const score = terms.reduce((sum, term) => sum + haystack.filter((token) => token.includes(term)).length, 0);
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
    .map(({ doc, score }) => ({ id: doc.id, title: doc.title, body: doc.body, url: doc.url, score, citations: doc.citations, tags: doc.tags }));
};
