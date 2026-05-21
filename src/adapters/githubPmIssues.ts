import { spawnSync } from "node:child_process";
import type { RecordManifest } from "../domain/types.js";
import { newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { nowIso, sha256, slugify } from "../lib/fs.js";

interface GhIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  updatedAt: string;
  labels: Array<{ name: string }>;
  comments?: Array<{ body: string; url: string; createdAt: string; author: { login: string } }>;
}

const parseCallIdentity = (issue: GhIssue): { series: string; date: string; number: number } => {
  const title = issue.title.toLowerCase();
  const dateMatch = issue.body.match(/\[([A-Z][a-z]+ \d{1,2}, 20\d{2}),/);
  const parsedDate = dateMatch?.[1] ? new Date(`${dateMatch[1]} UTC`) : null;
  const date = parsedDate && Number.isFinite(parsedDate.valueOf())
    ? parsedDate.toISOString().slice(0, 10)
    : issue.updatedAt?.slice(0, 10) ?? "1970-01-01";
  const number = Number.parseInt(issue.title.match(/#\s?(\d+)/)?.[1] ?? String(issue.number), 10);
  const series =
    title.includes("execution") || title.includes("acde") ? "acde" :
    title.includes("consensus") || title.includes("acdc") ? "acdc" :
    title.includes("testing") || title.includes("acdt") ? "acdt" :
    slugify(issue.title.replace(/#\s?\d+.*/, "")).slice(0, 32) || "protocol-call";
  return { series, date, number };
};

const extractAgenda = (body: string): string => {
  const agenda = body.split(/### Agenda/i)[1]?.split(/### Call Series/i)[0];
  return agenda?.trim() || body;
};

const discourseLinks = (issue: GhIssue): string[] =>
  [issue.body, ...(issue.comments ?? []).map((comment) => comment.body)]
    .flatMap((body) => Array.from(body.matchAll(/https:\/\/ethereum-magicians\.org\/t\/[^\s)]+/g)).map((match) => match[0]))
    .filter((value, index, values) => values.indexOf(value) === index);

const issueListViaGh = (limit: number): GhIssue[] => {
  const resolvedLimit = limit > 0 ? limit : 1000;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const list = spawnSync("gh", [
      "issue",
      "list",
      "-R",
      "ethereum/pm",
      "--state",
      "all",
      "--limit",
      String(resolvedLimit),
      "--search",
      "protocol-call",
      "--json",
      "number,title,body,state,url,updatedAt,labels,comments"
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
    if (list.status === 0) return JSON.parse(list.stdout) as GhIssue[];
    lastError = list.stderr || list.error?.message || `gh exited with status ${list.status}`;
    spawnSync("sleep", [String(attempt)], { encoding: "utf8" });
  }
  if (process.env.ENABLE_DUMMY_PIPELINE === "true") return [];
  throw new Error(`gh issue list failed for ethereum/pm protocol-call issues after retries: ${lastError}`);
};

const fixtureIssues = (): GhIssue[] => [
  {
    number: 2044,
    title: "All Core Devs - Execution (ACDE) #237, May 21, 2026",
    body: "### UTC Date & Time\n\n[May 21, 2026, 14:00 UTC]\n\n### Agenda\n\n- Glamsterdam\n  - EIP-7928 (BAL) spec update\n  - Propose EIP-8253 replace EIP-7610 in Glamsterdam\n- Hegotá\n  - Propose EIP-8182 Private ETH and ERC-20 Transfers\n  - Propose EIP-4758 Deactivate SELFDESTRUCT\n\n### Call Series\n\nAll Core Devs - Execution",
    state: "OPEN",
    url: "https://github.com/ethereum/pm/issues/2044",
    updatedAt: "2026-05-21T01:20:32Z",
    labels: [{ name: "protocol-call" }, { name: "Execution" }],
    comments: [{ body: "Discourse: https://ethereum-magicians.org/t/28485", url: "https://github.com/ethereum/pm/issues/2044#issuecomment-4415841073", createdAt: "2026-05-10T17:01:24Z", author: { login: "github-actions" } }]
  }
];

export const ingestGithubPmIssues = async (repoRoot: string, limit = 8, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const issues = issueListViaGh(limit);
  const selected = issues.length ? issues : process.env.ENABLE_DUMMY_PIPELINE === "true" ? fixtureIssues() : [];
  if (!selected.length) throw new Error("No ethereum/pm protocol-call issues were fetched; refusing to publish an empty GitHub PM issue corpus.");
  const entries = selected.map((issue) => {
    const identity = parseCallIdentity(issue);
    const canonicalDate = identity.date.replaceAll("-", ".");
    return {
      issue,
      identity,
      recordId: `${identity.series}/${canonicalDate}-${identity.number}`
    };
  });
  const primaryIssueByRecord = new Map<string, number>();
  for (const entry of entries) {
    const current = primaryIssueByRecord.get(entry.recordId) ?? 0;
    if (entry.issue.number > current) primaryIssueByRecord.set(entry.recordId, entry.issue.number);
  }
  const records: RecordManifest[] = [];
  for (const { issue, identity, recordId } of entries) {
    let record = newRecord({
      id: recordId,
      kind: "call",
      title: issue.title,
      generatedAt,
      sources: [{ type: "github-pm-issues", ref: `ethereum/pm#${issue.number}`, url: issue.url }],
      metadata: {
        series: identity.series,
        date: identity.date,
        number: identity.number,
        issue: issue.number,
        labels: issue.labels.map((label) => label.name),
        discourseLinks: discourseLinks(issue)
      }
    });
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "raw",
      role: "github-issue",
      fileName: `issue-${issue.number}.json`,
      body: `${JSON.stringify(issue, null, 2)}\n`,
      source: "github-pm-issues",
      sourceUrl: issue.url,
      generatedAt
    }));
    if (primaryIssueByRecord.get(recordId) === issue.number) {
      record = upsertArtifact(record, await writeArtifactText({
        repoRoot,
        record,
        layer: "normalized",
        role: "agenda",
        fileName: "agenda.json",
        body: `${JSON.stringify({
          issue: issue.number,
          title: issue.title,
          agendaMarkdown: extractAgenda(issue.body),
          bodyHash: sha256(issue.body),
          links: discourseLinks(issue)
        }, null, 2)}\n`,
        source: "github-pm-issues",
        sourceUrl: issue.url,
        from: [`raw/issue-${issue.number}.json`],
        generatedAt
      }));
    }
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
