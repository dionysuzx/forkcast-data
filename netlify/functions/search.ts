import type { Config } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);

export default async (request: Request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const docs = JSON.parse(await readFile(join(process.cwd(), "dist", "latest", "search", "index.json"), "utf8")) as Array<{ title: string; body: string; tags: string[] }>;
  const terms = tokenize(query);
  const results = docs
    .map((doc) => ({ doc, score: terms.reduce((sum, term) => sum + tokenize(`${doc.title} ${doc.body} ${doc.tags.join(" ")}`).filter((token) => token.includes(term)).length, 0) }))
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
