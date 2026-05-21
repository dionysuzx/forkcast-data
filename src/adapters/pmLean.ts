import { join } from "node:path";
import type { RecordManifest } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeCatalog, writeRecord } from "../domain/record.js";
import { pathExists, readJson, nowIso } from "../lib/fs.js";

interface PmLeanRecord {
  id: string;
  kind: "call";
  title: string;
  seriesSlug: string;
  date: string;
  number: number;
  updatedAt: string;
  dummy: boolean;
  sources: Array<{ type: string; ref: string; url?: string; metadata?: Record<string, unknown> }>;
  artifacts: Array<{ layer: "raw" | "normalized" | "derived"; role: string; path: string }>;
}

interface PmLeanCatalog {
  entries: Array<{
    id: string;
    kind: "call";
    title: string;
    manifestPath: string;
    updatedAt: string;
    dummy: boolean;
  }>;
}

const sourceType = (type: string): "pm-lean" | "fixture-live" | "dummy" =>
  type === "fixture-live" ? "fixture-live" : type === "dummy" ? "dummy" : "pm-lean";

export const ingestPmLean = async (repoRoot: string, pmLeanOut: string, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const catalogPath = join(pmLeanOut, "catalog.json");
  if (!(await pathExists(catalogPath))) return [];
  const catalog = await readJson<PmLeanCatalog>(catalogPath);
  const records: RecordManifest[] = [];
  for (const entry of catalog.entries) {
    const pmManifestPath = join(pmLeanOut, entry.manifestPath);
    const pmRecord = await readJson<PmLeanRecord>(pmManifestPath);
    let record = newRecord({
      id: pmRecord.id,
      kind: "call",
      title: pmRecord.title,
      generatedAt,
      dummy: pmRecord.dummy,
      sources: [
        { type: "pm-lean", ref: pmManifestPath },
        ...pmRecord.sources.map((source) => ({
          type: sourceType(source.type),
          ref: source.ref,
          url: source.url,
          metadata: source.metadata
        }))
      ],
      metadata: { series: pmRecord.seriesSlug, date: pmRecord.date, number: pmRecord.number }
    });
    const recordDir = pmManifestPath.replace(/manifest\.json$/, "");
    for (const artifact of pmRecord.artifacts) {
      record = upsertArtifact(record, await copyArtifactFile({
        repoRoot,
        record,
        sourceFile: join(recordDir, artifact.path),
        layer: artifact.layer,
        role: artifact.role,
        targetFileName: artifact.path.split("/").pop() ?? "artifact.txt",
        source: "pm-lean",
        generatedAt
      }));
    }
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
