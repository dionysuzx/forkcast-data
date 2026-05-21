import type { Config } from "@netlify/functions";
import { readLatestJson } from "./_shared/static-data.js";

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

export default async (request: Request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const docs = await readLatestJson<Array<{ title: string; body: string; tags: string[]; kind: string }>>("search/index.json");
  const terms = tokenize(query);
  const kind = url.searchParams.get("kind");
  const exactEip = eipNumberFromQuery(query);
  const results = docs
    .filter((doc) => !kind || kind === "all" || doc.kind === kind)
    .map((doc) => {
      const titleText = doc.title.toLowerCase();
      const tagText = doc.tags.join(" ").toLowerCase();
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
        exactEip && ((doc as { id?: string }).id === `eip-${exactEip}` || titleText.includes(`eip-${exactEip}`) || tagText.includes(`eip-${exactEip}`))
          ? 250
          : 0;
      const phrase = query.trim().toLowerCase();
      const phraseScore = phrase.length > 3 && (titleText.includes(phrase) || tagText.includes(phrase)) ? 40 : 0;
      const kindScore = terms.includes("eip") && doc.kind === "eip" ? 20 : 0;
      return { doc, score: termScore + exactEipScore + phraseScore + kindScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
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
