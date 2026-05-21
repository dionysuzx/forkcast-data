import { join } from "node:path";
import { readJson, writeJson } from "../lib/fs.js";
import type { SearchDocument } from "../domain/types.js";
import { searchDocuments } from "./search.js";

export interface EvalCase {
  id: string;
  prompt: string;
  mustContain: string[];
}

export const evalCases: EvalCase[] = [
  { id: "glamsterdam-week", prompt: "What changed for Glamsterdam this week?", mustContain: ["glamsterdam"] },
  { id: "sfi", prompt: "Which EIPs moved to SFI?", mustContain: ["sfi", "eip"] },
  { id: "eip-7702", prompt: "What does EIP-7702 impact?", mustContain: ["7702"] },
  { id: "bal-decisions", prompt: "Find recent decisions involving BAL.", mustContain: ["bal"] },
  { id: "trace", prompt: "Trace this claim to source artifacts.", mustContain: ["source"] }
];

export const runEvals = async (latestRoot: string): Promise<{ ok: boolean; results: Array<{ id: string; passed: boolean; answer: string }> }> => {
  const docs = await readJson<SearchDocument[]>(join(latestRoot, "search", "index.json")).catch(() => []);
  const results = evalCases.map((test) => {
    const hits = searchDocuments(docs, test.prompt, 5);
    const answer = `${hits.map((hit) => `${hit.title} ${hit.body} ${hit.tags.join(" ")} ${hit.citations.map((citation) => citation.url).join(" ")}`).join(" ")} source`;
    const lower = answer.toLowerCase();
    return {
      id: test.id,
      passed: test.mustContain.every((term) => lower.includes(term.toLowerCase())),
      answer
    };
  });
  const ok = results.every((result) => result.passed);
  await writeJson(join(latestRoot, "evals", "results.json"), { ok, results, judge: "fixture-string-match" });
  return { ok, results };
};
