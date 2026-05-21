import { basename, join } from "node:path";
import type { RecordManifest, SourceRef } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { listFiles, nowIso, pathExists, readJson } from "../lib/fs.js";

type ForkcastEip = Record<string, unknown> & {
  id?: number;
  title?: string;
  status?: string;
  description?: string;
  laymanDescription?: string;
  stakeholderImpacts?: Record<string, { description?: string }>;
  discussionLink?: string;
};

interface ParsedEip {
  number: number;
  title: string;
  description: string;
  status: string;
  type: string;
  category: string;
  author: string;
  created: string;
  discussionsTo?: string;
  requires: string[];
  bodyMarkdown: string;
  abstract: string;
}

const frontmatterPattern = /^---\n([\s\S]*?)\n---\n?/;

const parseFrontmatter = (content: string): { attrs: Record<string, string>; body: string } => {
  const match = content.match(frontmatterPattern);
  if (!match?.[1]) return { attrs: {}, body: content };
  const attrs: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    attrs[key] = value;
  }
  return { attrs, body: content.slice(match[0].length) };
};

const sectionExcerpt = (body: string, heading: string): string => {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s+|$)`, "im");
  const match = body.match(pattern);
  return (match?.[1] ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (value) => value.replace(/\[|\]\([^)]+\)/g, ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
};

const csv = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);

const parseEipMarkdown = async (file: string): Promise<ParsedEip | null> => {
  const text = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
  const { attrs, body } = parseFrontmatter(text);
  const number = Number.parseInt(attrs.eip ?? basename(file).match(/\d+/)?.[0] ?? "", 10);
  if (!Number.isFinite(number)) return null;
  const abstract = sectionExcerpt(body, "Abstract");
  const parsed: ParsedEip = {
    number,
    title: attrs.title ? `EIP-${number}: ${attrs.title}` : `EIP-${number}`,
    description: attrs.description ?? abstract,
    status: attrs.status ?? "Unknown",
    type: attrs.type ?? "Unknown",
    category: attrs.category ?? "Unknown",
    author: attrs.author ?? "Unknown",
    created: attrs.created ?? "",
    requires: csv(attrs.requires),
    bodyMarkdown: body,
    abstract
  };
  if (attrs["discussions-to"]) parsed.discussionsTo = attrs["discussions-to"];
  return parsed;
};

const loadForkcastEips = async (forkcastRoot: string): Promise<Map<number, ForkcastEip>> => {
  const result = new Map<number, ForkcastEip>();
  const indexPath = join(forkcastRoot, "src", "data", "eips.json");
  if (await pathExists(indexPath)) {
    for (const item of await readJson<ForkcastEip[]>(indexPath)) {
      if (typeof item.id === "number") result.set(item.id, item);
    }
  }
  const eipDir = join(forkcastRoot, "src", "data", "eips");
  if (await pathExists(eipDir)) {
    for (const file of (await listFiles(eipDir)).filter((entry) => entry.endsWith(".json"))) {
      const item = await readJson<ForkcastEip>(file);
      if (typeof item.id === "number") result.set(item.id, item);
    }
  }
  return result;
};

const mergedProposal = (official: ParsedEip, forkcast?: ForkcastEip) => ({
  id: official.number,
  title: forkcast?.title ?? official.title,
  status: forkcast?.status ?? official.status,
  description: forkcast?.description ?? official.description,
  laymanDescription: forkcast?.laymanDescription ?? official.abstract ?? official.description,
  author: official.author,
  type: official.type,
  category: official.category,
  createdDate: official.created,
  discussionLink: forkcast?.discussionLink ?? official.discussionsTo,
  requires: official.requires,
  source: {
    official: "ethereum/EIPs",
    forkcastEnrichment: Boolean(forkcast)
  },
  forkRelationships: forkcast?.forkRelationships,
  stakeholderImpacts: forkcast?.stakeholderImpacts,
  benefits: forkcast?.benefits,
  tradeoffs: forkcast?.tradeoffs,
  abstract: official.abstract,
  bodyPreview: official.bodyMarkdown.replace(/\s+/g, " ").trim().slice(0, 6000)
});

export const ingestEips = async (
  repoRoot: string,
  eipsRoot: string,
  forkcastRoot: string,
  generatedAt = nowIso()
): Promise<RecordManifest[]> => {
  const eipDir = join(eipsRoot, "EIPS");
  if (!(await pathExists(eipDir))) return [];
  const forkcast = await loadForkcastEips(forkcastRoot);
  const files = (await listFiles(eipDir))
    .filter((file) => /\/eip-\d+\.md$/.test(file))
    .sort((a, b) => Number(a.match(/eip-(\d+)\.md$/)?.[1] ?? 0) - Number(b.match(/eip-(\d+)\.md$/)?.[1] ?? 0));
  const records: RecordManifest[] = [];
  for (const file of files) {
    const parsed = await parseEipMarkdown(file);
    if (!parsed) continue;
    const enrichment = forkcast.get(parsed.number);
    const sources: SourceRef[] = [
      { type: "eips", ref: `EIPS/eip-${parsed.number}.md`, url: `https://github.com/ethereum/EIPs/blob/master/EIPS/eip-${parsed.number}.md` }
    ];
    if (enrichment) {
      sources.push({
        type: "forkcast",
        ref: `src/data/eips/${parsed.number}.json`,
        url: `https://github.com/ethereum/forkcast/blob/main/src/data/eips/${parsed.number}.json`,
        metadata: { enrichment: true }
      });
    }
    let record = newRecord({
      id: `eip-${parsed.number}`,
      kind: "proposal",
      title: enrichment?.title ?? parsed.title,
      generatedAt,
      sources,
      metadata: {
        eip: parsed.number,
        status: enrichment?.status ?? parsed.status,
        category: parsed.category,
        type: parsed.type,
        created: parsed.created,
        discussionLink: enrichment?.discussionLink ?? parsed.discussionsTo,
        sourcePriority: ["ethereum/EIPs", "forkcast-enrichment"]
      }
    });
    record = upsertArtifact(record, await copyArtifactFile({
      repoRoot,
      record,
      sourceFile: file,
      layer: "raw",
      role: "proposal-markdown",
      targetFileName: `eip-${parsed.number}.md`,
      source: "eips",
      sourceUrl: `https://github.com/ethereum/EIPs/blob/master/EIPS/eip-${parsed.number}.md`,
      generatedAt
    }));
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "normalized",
      role: "proposal",
      fileName: `${parsed.number}.json`,
      body: `${JSON.stringify(mergedProposal(parsed, enrichment), null, 2)}\n`,
      source: "forkcast-data",
      generatedAt,
      from: [`raw/eip-${parsed.number}.md`]
    }));
    if (enrichment) {
      record = upsertArtifact(record, await writeArtifactText({
        repoRoot,
        record,
        layer: "normalized",
        role: "forkcast-eip-enrichment",
        fileName: `forkcast-${parsed.number}.json`,
        body: `${JSON.stringify(enrichment, null, 2)}\n`,
        source: "forkcast",
        sourceUrl: `https://github.com/ethereum/forkcast/blob/main/src/data/eips/${parsed.number}.json`,
        generatedAt,
        from: [`normalized/${parsed.number}.json`]
      }));
    }
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
