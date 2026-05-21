import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildCatalog, readAllRecords } from "../domain/record.js";
import type { SnapshotManifest } from "../domain/types.js";
import { listFiles, nowIso, sha256, writeJson } from "../lib/fs.js";
import { buildReadModels } from "./readModels.js";

export const buildSnapshot = async (repoRoot: string, distRoot = join(repoRoot, "dist"), generatedAt = nowIso()): Promise<SnapshotManifest> => {
  const latestRoot = join(distRoot, "latest");
  const readModels = await buildReadModels(repoRoot, latestRoot);
  const records = await readAllRecords(repoRoot);
  const catalog = await buildCatalog(repoRoot, generatedAt);
  await writeJson(join(repoRoot, "catalog.json"), catalog);

  const fingerprint = sha256(JSON.stringify(catalog.records.map((record) => [record.id, record.updated_at]))).slice(0, 12);
  const snapshotId = `${generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${fingerprint}`;
  const snapshotRoot = join(distRoot, "snapshots", snapshotId);
  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });
  await cp(latestRoot, snapshotRoot, { recursive: true });
  await cp(join(repoRoot, "records"), join(snapshotRoot, "records"), { recursive: true });
  await rm(join(distRoot, "records"), { recursive: true, force: true });
  await cp(join(repoRoot, "records"), join(distRoot, "records"), { recursive: true });

  const provenanceComplete = records.every((record) => record.artifacts.every((artifact) => artifact.provenance?.generatedAt && artifact.sha256));
  const manifest: SnapshotManifest = {
    version: 1,
    snapshot_id: snapshotId,
    generated_at: generatedAt,
    catalog_path: `/snapshots/${snapshotId}/catalog.json`,
    record_count: records.length,
    read_models: readModels,
    provenance_complete: provenanceComplete,
    dummy: records.some((record) => record.dummy)
  };

  await writeJson(join(snapshotRoot, "manifest.json"), manifest);
  await writeJson(join(snapshotRoot, "catalog.json"), catalog);
  await writeJson(join(latestRoot, "manifest.json"), manifest);
  await writeJson(join(latestRoot, "catalog.json"), catalog);
  await writeJson(join(distRoot, "manifest.json"), manifest);
  await writeJson(join(distRoot, "catalog.json"), catalog);

  const files = await listFiles(snapshotRoot);
  await writeJson(join(distRoot, "snapshots", "index.json"), {
    latest: snapshotId,
    snapshots: [{ snapshot_id: snapshotId, generated_at: generatedAt, file_count: files.length }]
  });
  return manifest;
};
