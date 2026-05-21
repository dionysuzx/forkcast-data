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
  const date = dateMatch?.[1] ? new Date(`${dateMatch[1]} UTC`).toISOString().slice(0, 10) : issue.updatedAt.slice(0, 10);
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
  const list = spawnSync("gh", [
    "issue",
    "list",
    "-R",
    "ethereum/pm",
    "--state",
    "all",
    "--limit",
    String(limit),
    "--search",
    "protocol-call",
    "--json",
    "number"
  ], { encoding: "utf8" });
  if (list.status !== 0) return [];
  const numbers = (JSON.parse(list.stdout) as Array<{ number: number }>).map((issue) => issue.number);
  const issues: GhIssue[] = [];
  for (const number of numbers) {
    const view = spawnSync("gh", [
      "issue",
      "view",
      String(number),
      "-R",
      "ethereum/pm",
      "--comments",
      "--json",
      "number,title,body,state,url,updatedAt,labels,comments"
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
    if (view.status === 0) issues.push(JSON.parse(view.stdout) as GhIssue);
  }
  return issues;
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
  const selected = issues.length ? issues : fixtureIssues();
  const records: RecordManifest[] = [];
  for (const issue of selected) {
    const identity = parseCallIdentity(issue);
    const canonicalDate = identity.date.replaceAll("-", ".");
    let record = newRecord({
      id: `${identity.series}/${canonicalDate}-${identity.number}`,
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
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
