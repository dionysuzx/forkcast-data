import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildCatalog, publicRecordUrl, readAllRecords, readArtifactText, writeCatalog } from "../domain/record.js";
import type { CallReadModel, Citation, DecisionReadModel, EipReadModel, RecordManifest } from "../domain/types.js";
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

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const compact = (value: string, max = 600): string =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

const stakeholderImpacts = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, { description?: unknown }>)
    .map((entry) => typeof entry.description === "string" ? entry.description : "")
    .filter(Boolean);
};

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
    const summary = String(data.laymanDescription ?? data.abstract ?? data.description ?? data.summary ?? record.title);
    const impacts = [
      ...stringArray(data.impacts),
      ...stakeholderImpacts(data.stakeholderImpacts),
      ...stringArray(data.benefits)
    ];
    const model: EipReadModel = {
      id: number,
      title: String(data.title ?? record.title),
      status: String(data.status ?? record.metadata?.status ?? "Unknown"),
      type: typeof data.type === "string" ? data.type : undefined,
      category: typeof data.category === "string" ? data.category : undefined,
      summary,
      impacts,
      discussion_url: typeof data.discussionLink === "string" ? data.discussionLink : undefined,
      source_markdown_url: record.sources.find((source) => source.type === "eips")?.url,
      canonical_url: `/latest/eips/${number}.json`,
      markdown_url: `/latest/eips/${number}.md`,
      citations: [citationFor(record, artifact?.path ?? "manifest.json", summary.slice(0, 220))]
    };
    eips.push(model);
    await writeJson(join(outRoot, "eips", `${number}.json`), model);
    await writeText(join(outRoot, "eips", `${number}.md`), `# ${model.title}\n\nStatus: ${model.status}\n\n${model.summary}\n\n${model.impacts.map((impact) => `- ${impact}`).join("\n")}\n\nSource: ${model.citations[0]?.url}\n`);
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

  const threadModels: Array<{
    id: string;
    title: string;
    kind: string;
    channel?: string | undefined;
    date?: string | undefined;
    message_count?: number | undefined;
    summary: string;
    canonical_json_url: string;
    citations: Citation[];
  }> = [];
  const topicModels: Array<{
    id: string;
    title: string;
    kind: string;
    summary: string;
    canonical_json_url: string;
    citations: Citation[];
  }> = [];
  for (const record of records.filter((candidate) => candidate.kind === "thread" || candidate.kind === "topic")) {
    const messagesArtifact = record.artifacts.find((entry) => entry.role === "messages");
    const textArtifact = messagesArtifact ?? record.artifacts.find((entry) => entry.role === "source-text");
    const data = textArtifact ? JSON.parse(await readArtifactText(repoRoot, record, textArtifact)) as Record<string, unknown> : {};
    const source = record.sources[0];
    const detailPath = `${record.kind}s/${record.id.replaceAll("/", "__")}.json`;
    const sourceArtifactPath = textArtifact?.path ?? "manifest.json";
    const canonical = record.kind === "thread"
      ? `/${recordBaseUrl(record)}/${sourceArtifactPath}`
      : `/latest/${detailPath}`;
    const model = {
      id: record.id,
      title: record.title,
      kind: record.kind,
      channel: typeof record.metadata?.channel === "string" ? record.metadata.channel : undefined,
      date: typeof record.metadata?.date === "string" ? record.metadata.date : undefined,
      message_count: typeof record.metadata?.messageCount === "number" ? record.metadata.messageCount : undefined,
      summary: compact(String(data.searchText ?? record.metadata?.note ?? source?.url ?? record.title), 1000),
      canonical_json_url: canonical,
      citations: [citationFor(record, sourceArtifactPath, record.title)]
    };
    if (record.kind === "thread") {
      threadModels.push({ ...model, summary: compact(model.summary, 180) });
    } else {
      await writeJson(join(outRoot, detailPath), model);
      readModels.push(detailPath);
      topicModels.push({ id: model.id, title: model.title, kind: model.kind, summary: compact(model.summary, 260), canonical_json_url: model.canonical_json_url, citations: model.citations });
    }
  }
  await writeJson(join(outRoot, "threads", "index.json"), threadModels.sort((a, b) => String(b.date).localeCompare(String(a.date))));
  await writeJson(join(outRoot, "topics", "index.json"), topicModels.sort((a, b) => a.title.localeCompare(b.title)));
  readModels.push("threads/index.json", "topics/index.json");

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

  const recordsByKind = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.kind] = (acc[record.kind] ?? 0) + 1;
    return acc;
  }, {});
  const recordsBySource = records.reduce<Record<string, number>>((acc, record) => {
    for (const source of record.sources) acc[source.type] = (acc[source.type] ?? 0) + 1;
    return acc;
  }, {});
  await writeJson(join(outRoot, "stats.json"), {
    generated_at: nowIso(),
    record_count: records.length,
    read_model_count: readModels.length,
    records_by_kind: recordsByKind,
    records_by_source: recordsBySource,
    artifact_count: records.reduce((sum, record) => sum + record.artifacts.length, 0)
  });
  readModels.push("stats.json");
  await writeJson(join(outRoot, "manifest.json"), {
    generated_at: nowIso(),
    read_models: readModels.sort()
  });
  await writeCatalog(repoRoot);
  const catalog = await buildCatalog(repoRoot);
  await writeJson(join(outRoot, "catalog.json"), catalog);
  return readModels.sort();
};
