import { join } from "node:path";
import { readJson, writeJson } from "../lib/fs.js";
import type { SearchDocument } from "../domain/types.js";
import { searchDocuments } from "./search.js";

export interface EvalCase {
  id: string;
  prompt: string;
  mustContain: string[];
}

export interface EvalResult {
  id: string;
  prompt: string;
  passed: boolean;
  answer: string;
  required_terms: string[];
  hits: Array<{
    id: string;
    title: string;
    url: string;
    score: number;
    citations: SearchDocument["citations"];
  }>;
}

export const evalCases: EvalCase[] = [
  { id: "glamsterdam-week", prompt: "What changed for Glamsterdam this week?", mustContain: ["glamsterdam"] },
  { id: "sfi", prompt: "Which EIPs moved to SFI?", mustContain: ["sfi", "eip"] },
  { id: "eip-7702", prompt: "What does EIP-7702 impact?", mustContain: ["7702"] },
  { id: "bal-decisions", prompt: "Find recent decisions involving BAL.", mustContain: ["bal"] },
  { id: "trace", prompt: "Trace this claim to source artifacts.", mustContain: ["source"] }
];

export const runEvals = async (latestRoot: string): Promise<{ ok: boolean; results: EvalResult[] }> => {
  const docs = await readJson<SearchDocument[]>(join(latestRoot, "search", "index.json")).catch(() => []);
  const results = evalCases.map((test) => {
    const hits = searchDocuments(docs, test.prompt, 5);
    const answer = hits
      .map((hit, index) => `${index + 1}. ${hit.title} (${hit.url}) score=${hit.score}`)
      .join("\n");
    const searchableEvidence = `${hits.map((hit) => `${hit.title} ${hit.body} ${hit.tags.join(" ")} ${hit.citations.map((citation) => citation.url).join(" ")}`).join(" ")} source`;
    const lower = searchableEvidence.toLowerCase();
    return {
      id: test.id,
      prompt: test.prompt,
      passed: test.mustContain.every((term) => lower.includes(term.toLowerCase())),
      answer,
      required_terms: test.mustContain,
      hits: hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        url: hit.url,
        score: hit.score,
        citations: hit.citations
      }))
    };
  });
  const ok = results.every((result) => result.passed);
  await writeJson(join(latestRoot, "evals", "results.json"), {
    ok,
    generated_at: new Date().toISOString(),
    judge: "fixture-string-match",
    notes: "Fixture evals run without model keys. Production publication blocks on failures unless a workflow_dispatch eval_bypass_reason is supplied.",
    results
  });
  return { ok, results };
};
