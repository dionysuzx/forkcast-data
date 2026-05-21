import { join } from "node:path";
import { buildCatalog, readAllRecords } from "../domain/record.js";
import type { RecordManifest } from "../domain/types.js";
import { pathExists } from "../lib/fs.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const validateRecord = async (repoRoot: string, record: RecordManifest): Promise<string[]> => {
  const errors: string[] = [];
  if (!record.id) errors.push("missing id");
  if (!record.kind) errors.push(`${record.id}: missing kind`);
  if (!record.title) errors.push(`${record.id}: missing title`);
  if (!record.sources.length) errors.push(`${record.id}: missing sources`);
  if (!record.artifacts.length) errors.push(`${record.id}: missing artifacts`);
  for (const artifact of record.artifacts) {
    if (!artifact.provenance?.generatedAt) errors.push(`${record.id}/${artifact.path}: missing provenance.generatedAt`);
    if (!artifact.sha256) errors.push(`${record.id}/${artifact.path}: missing sha256`);
  }
  return errors;
};

export const validate = async (repoRoot: string): Promise<ValidationResult> => {
  const records = await readAllRecords(repoRoot);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!records.length) errors.push("No canonical records found under records/");
  for (const record of records) errors.push(...await validateRecord(repoRoot, record));
  const catalog = await buildCatalog(repoRoot);
  const ids = new Set<string>();
  for (const entry of catalog.records) {
    const key = `${entry.kind}:${entry.id}`;
    if (ids.has(key)) errors.push(`Duplicate catalog entry: ${key}`);
    ids.add(key);
  }
  for (const schema of ["record-manifest.schema.json", "catalog.schema.json", "snapshot-manifest.schema.json"]) {
    if (!(await pathExists(join(repoRoot, "schemas", schema)))) errors.push(`Missing schema ${schema}`);
  }
  if (records.some((record) => record.dummy)) warnings.push("Dataset contains dummy records; production publish must opt in with audit reason.");
  return { ok: errors.length === 0, errors, warnings };
};
