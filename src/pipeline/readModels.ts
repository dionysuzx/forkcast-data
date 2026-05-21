import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildCatalog, publicRecordUrl, readAllRecords, readArtifactText, writeCatalog } from "../domain/record.js";
import type { CallReadModel, DecisionReadModel, EipReadModel, RecordManifest } from "../domain/types.js";
import { nowIso, readJson, writeJson, writeText } from "../lib/fs.js";
import { readDerivedCall } from "./derive.js";

const citationFor = (record: RecordManifest, artifactPath: string, snippet?: string) => ({
  recordId: record.id,
  artifactPath,
  url: `/${recordBaseUrl(record)}/${artifactPath}`,
  label: record.title,
  snippet
});

const recordBaseUrl = (record: RecordManifest): string => {
  if (record.kind === "call") {
    const [series, rest] = record.id.split("/");
    return `records/call/${series}/${rest}`;
  }
  return `records/${record.kind}/${record.id}`;
};

const proposalNumber = (record: RecordManifest): number | null =>
  Number.parseInt(record.id.replace(/^eip-/, ""), 10) || null;

export const buildReadModels = async (repoRoot: string, outRoot: string): Promise<string[]> => {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const records = await readAllRecords(repoRoot);
  const readModels: string[] = [];

  const eips: EipReadModel[] = [];
  for (const record of records.filter((candidate) => candidate.kind === "proposal")) {
    const number = proposalNumber(record);
    if (!number) continue;
    const artifact = record.artifacts.find((entry) => entry.role === "proposal") ?? record.artifacts.find((entry) => entry.role === "proposal-brief");
    const data = artifact ? JSON.parse(await readArtifactText(repoRoot, record, artifact)) as Record<string, unknown> : {};
    const summary = String(data.laymanDescription ?? data.description ?? data.summary ?? record.title);
    const model: EipReadModel = {
      id: number,
      title: String(data.title ?? record.title),
      status: String(data.status ?? record.metadata?.status ?? "Unknown"),
      summary,
      impacts: Array.isArray(data.impacts) ? data.impacts.map(String) : [],
      canonical_url: `/latest/eips/${number}.json`,
      markdown_url: `/latest/eips/${number}.md`,
      citations: [citationFor(record, artifact?.path ?? "manifest.json", summary.slice(0, 220))]
    };
    eips.push(model);
    await writeJson(join(outRoot, "eips", `${number}.json`), model);
    await writeText(join(outRoot, "eips", `${number}.md`), `# ${model.title}\n\n${model.summary}\n\nSource: ${model.citations[0]?.url}\n`);
    readModels.push(`eips/${number}.json`, `eips/${number}.md`);
  }
  await writeJson(join(outRoot, "eips", "index.json"), eips.sort((a, b) => a.id - b.id));
  readModels.push("eips/index.json");

  const calls: CallReadModel[] = [];
  const decisions: DecisionReadModel[] = [];
  for (const record of records.filter((candidate) => candidate.kind === "call")) {
    const metadata = record.metadata ?? {};
    const series = String(metadata.series ?? record.id.split("/")[0]);
    const number = Number(metadata.number ?? record.id.split("-").at(-1) ?? 0);
    const date = String(metadata.date ?? "");
    const derived = await readDerivedCall(repoRoot, record);
    const model: CallReadModel = {
      id: record.id,
      series,
      number,
      date,
      title: record.title,
      summary: derived?.summary ?? record.title,
      decisions: derived?.decisions ?? [],
      canonical_json_url: `/latest/calls/${series}/${number}.json`,
      canonical_markdown_url: `/latest/calls/${series}/${number}.md`,
      citations: [citationFor(record, "manifest.json", record.title)]
    };
    calls.push(model);
    decisions.push(...model.decisions);
    await writeJson(join(outRoot, "calls", series, `${number}.json`), model);
    await writeText(join(outRoot, "calls", series, `${number}.md`), `# ${model.title}\n\n${model.summary}\n\n${model.decisions.map((decision) => `- ${decision.title}`).join("\n")}\n`);
    readModels.push(`calls/${series}/${number}.json`, `calls/${series}/${number}.md`);
  }
  await writeJson(join(outRoot, "calls", "index.json"), calls.sort((a, b) => b.date.localeCompare(a.date)));
  await writeText(join(outRoot, "decisions", "index.ndjson"), `${decisions.map((decision) => JSON.stringify(decision)).join("\n")}\n`);
  readModels.push("calls/index.json", "decisions/index.ndjson");

  for (const record of records.filter((candidate) => candidate.kind === "upgrade")) {
    await writeJson(join(outRoot, "upgrades", `${record.id}.json`), {
      id: record.id,
      title: record.title,
      metadata: record.metadata,
      canonical_url: publicRecordUrl(record),
      citations: [citationFor(record, "manifest.json")]
    });
    readModels.push(`upgrades/${record.id}.json`);
  }

  for (const record of records.filter((candidate) => candidate.kind === "devnet")) {
    const artifact = record.artifacts.find((entry) => entry.role === "devnet");
    const data = artifact ? await readJson<unknown>(join(repoRoot, recordBaseUrl(record), artifact.path)) : record.metadata;
    await writeJson(join(outRoot, "devnets", `${record.id}.json`), {
      id: record.id,
      title: record.title,
      data,
      citations: [citationFor(record, artifact?.path ?? "manifest.json")]
    });
    readModels.push(`devnets/${record.id}.json`);
  }

  await writeJson(join(outRoot, "manifest.json"), {
    generated_at: nowIso(),
    read_models: readModels.sort()
  });
  await writeCatalog(repoRoot);
  const catalog = await buildCatalog(repoRoot);
  await writeJson(join(outRoot, "catalog.json"), catalog);
  return readModels.sort();
};
