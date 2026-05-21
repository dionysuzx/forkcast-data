import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, Catalog, CatalogEntry, RecordKind, RecordManifest } from "./types.js";
import { copyFileInto, listFiles, nowIso, readJson, sha256, sha256File, unixRelative, writeJson, writeText } from "../lib/fs.js";

export const GENERATOR_NAME = "forkcast-data";
export const GENERATOR_VERSION = "0.1.0";

export const recordBasePath = (record: Pick<RecordManifest, "id" | "kind">): string => {
  if (record.kind === "call") {
    const [series, rest] = record.id.split("/");
    if (!series || !rest) throw new Error(`Invalid call id: ${record.id}`);
    return join("records", "call", series, rest);
  }
  if (record.kind === "topic") return join("records", "topic", record.id);
  if (record.kind === "thread") return join("records", "thread", record.id);
  if (record.kind === "upgrade") return join("records", "upgrade", record.id);
  if (record.kind === "proposal") return join("records", "proposal", record.id);
  return join("records", "devnet", record.id);
};

export const recordManifestPath = (repoRoot: string, record: Pick<RecordManifest, "id" | "kind">): string =>
  join(repoRoot, recordBasePath(record), "manifest.json");

export const writeRecord = async (repoRoot: string, record: RecordManifest): Promise<void> => {
  await writeJson(recordManifestPath(repoRoot, record), record);
};

export const artifactPath = (repoRoot: string, record: Pick<RecordManifest, "id" | "kind">, relativePath: string): string =>
  join(repoRoot, recordBasePath(record), relativePath);

export const writeArtifactText = async (args: {
  repoRoot: string;
  record: RecordManifest;
  layer: "raw" | "normalized" | "derived";
  role: string;
  fileName: string;
  body: string;
  source: string;
  sourcePath?: string;
  sourceUrl?: string;
  from?: string[];
  generatedAt: string;
}): Promise<Artifact> => {
  const relativePath = `${args.layer}/${args.fileName}`;
  const target = artifactPath(args.repoRoot, args.record, relativePath);
  await writeText(target, args.body);
  const info = await stat(target);
  const digest = sha256(args.body);
  const artifact: Artifact = {
    layer: args.layer,
    role: args.role,
    path: relativePath,
    sha256: digest,
    bytes: info.size,
    updatedAt: args.generatedAt,
    source: args.source,
    producedBy: `${GENERATOR_NAME}@${GENERATOR_VERSION}`,
    provenance: {
      source: args.source,
      sourceHash: digest,
      generatedAt: args.generatedAt,
      generator: GENERATOR_NAME,
      generatorVersion: GENERATOR_VERSION,
      provider: "fixture",
      model: "deterministic"
    }
  };
  if (args.sourcePath) artifact.provenance.sourcePath = args.sourcePath;
  if (args.sourceUrl) artifact.provenance.sourceUrl = args.sourceUrl;
  if (args.from) {
    artifact.from = args.from;
    artifact.provenance.inputHashes = args.record.artifacts
      .filter((candidate) => args.from?.includes(candidate.path))
      .map((candidate) => candidate.sha256)
      .sort();
  }
  return artifact;
};

export const copyArtifactFile = async (args: {
  repoRoot: string;
  record: RecordManifest;
  sourceFile: string;
  layer: "raw" | "normalized" | "derived";
  role: string;
  targetFileName: string;
  source: string;
  sourceUrl?: string;
  generatedAt: string;
}): Promise<Artifact> => {
  const relativePath = `${args.layer}/${args.targetFileName}`;
  const target = artifactPath(args.repoRoot, args.record, relativePath);
  await copyFileInto(args.sourceFile, target);
  const info = await stat(target);
  const digest = await sha256File(target);
  const artifact: Artifact = {
    layer: args.layer,
    role: args.role,
    path: relativePath,
    sha256: digest,
    bytes: info.size,
    updatedAt: info.mtime.toISOString(),
    source: args.source,
    provenance: {
      source: args.source,
      sourcePath: args.sourceFile,
      sourceHash: digest,
      generatedAt: args.generatedAt,
      generator: GENERATOR_NAME,
      generatorVersion: GENERATOR_VERSION
    }
  };
  if (args.sourceUrl) artifact.provenance.sourceUrl = args.sourceUrl;
  return artifact;
};

export const upsertArtifact = (record: RecordManifest, artifact: Artifact): RecordManifest => ({
  ...record,
  updatedAt: artifact.updatedAt > record.updatedAt ? artifact.updatedAt : record.updatedAt,
  artifacts: [
    ...record.artifacts.filter((entry) => entry.path !== artifact.path),
    artifact
  ].sort((a, b) => a.path.localeCompare(b.path))
});

export const listRecordManifests = async (repoRoot: string): Promise<string[]> =>
  (await listFiles(join(repoRoot, "records"))).filter((path) => path.endsWith("manifest.json"));

export const readAllRecords = async (repoRoot: string): Promise<RecordManifest[]> => {
  const manifests = await listRecordManifests(repoRoot);
  return Promise.all(manifests.map((path) => readJson<RecordManifest>(path)));
};

export const buildCatalog = async (repoRoot: string, generatedAt = nowIso()): Promise<Catalog> => {
  const records = await readAllRecords(repoRoot);
  const entries: CatalogEntry[] = records.map((record) => ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    manifest_path: `${unixRelative(repoRoot, recordManifestPath(repoRoot, record))}`,
    updated_at: record.updatedAt,
    dummy: record.dummy
  }));
  return {
    version: 1,
    generated_at: generatedAt,
    records: entries.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
  };
};

export const writeCatalog = async (repoRoot: string, generatedAt = nowIso()): Promise<Catalog> => {
  const catalog = await buildCatalog(repoRoot, generatedAt);
  await writeJson(join(repoRoot, "catalog.json"), catalog);
  return catalog;
};

export const readArtifactText = async (repoRoot: string, record: RecordManifest, artifact: Artifact): Promise<string> =>
  readFile(artifactPath(repoRoot, record, artifact.path), "utf8");

export const publicRecordUrl = (record: RecordManifest): string => {
  if (record.kind === "call") {
    const [series, rest] = record.id.split("/");
    const number = rest?.split("-").at(-1) ?? "";
    return `/latest/calls/${series}/${number}.json`;
  }
  if (record.kind === "proposal") return `/latest/eips/${record.id.replace(/^eip-/, "")}.json`;
  if (record.kind === "upgrade") return `/latest/upgrades/${record.id}.json`;
  if (record.kind === "devnet") return `/latest/devnets/${record.id}.json`;
  return `/records/${record.kind}/${record.id}/manifest.json`;
};

export const newRecord = (args: {
  id: string;
  kind: RecordKind;
  title: string;
  generatedAt: string;
  dummy?: boolean;
  sources?: RecordManifest["sources"];
  metadata?: Record<string, unknown>;
}): RecordManifest => {
  const record: RecordManifest = {
    id: args.id,
    kind: args.kind,
    title: args.title,
    updatedAt: args.generatedAt,
    dummy: args.dummy ?? false,
    sources: args.sources ?? [],
    artifacts: []
  };
  if (args.metadata) record.metadata = args.metadata;
  return record;
};
