import type { RecordManifest } from "../domain/types.js";
import { newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { nowIso, slugify } from "../lib/fs.js";

export const ingestDiscourseLinks = async (repoRoot: string, links: string[], generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const records: RecordManifest[] = [];
  const unique = links.filter((link, index, values) => values.indexOf(link) === index).slice(0, 8);
  for (const link of unique) {
    const id = link.match(/\/t\/(?:[^/]+\/)?(\d+)/)?.[1] ?? slugify(link);
    let record = newRecord({
      id: `ethereum-magicians/${id}`,
      kind: "topic",
      title: `Ethereum Magicians topic ${id}`,
      generatedAt,
      sources: [{ type: "discourse", ref: link, url: link }],
      metadata: { adapter: "discourse", note: "Source URL captured; full API fetch is enabled when Discourse API credentials are configured." }
    });
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "raw",
      role: "topic-link",
      fileName: "topic-link.json",
      body: `${JSON.stringify({ url: link, topicId: id }, null, 2)}\n`,
      source: "discourse",
      sourceUrl: link,
      generatedAt
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
