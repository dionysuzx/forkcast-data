import { join } from "node:path";
import type { RecordManifest } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { listFiles, nowIso, pathExists, readJson, slugify } from "../lib/fs.js";

interface DiscordMessage {
  author: string;
  category: string;
  parent: string;
  content: string;
  created_at: string;
  attachments: unknown[];
}

export const ingestDiscordArchive = async (repoRoot: string, archiveRoot: string, limit = 12, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  if (!(await pathExists(archiveRoot))) return [];
  const candidateFiles = (await listFiles(archiveRoot))
    .filter((file) => /(allcoredevs|block-access-lists|pectra-upgrade|post-quantum)\/20\d\d-\d\d-\d\d\.json$/.test(file))
    .slice(-limit);
  const records: RecordManifest[] = [];
  for (const file of candidateFiles) {
    const rel = file.slice(archiveRoot.length + 1);
    const [channel = "unknown", dateFile = "unknown.json"] = rel.split("/");
    const date = dateFile.replace(/\.json$/, "");
    const messages = await readJson<DiscordMessage[]>(file);
    let record = newRecord({
      id: `discord-archive/${slugify(channel)}/${date}`,
      kind: "thread",
      title: `${channel} Discord archive ${date}`,
      generatedAt,
      sources: [{ type: "discord-archive", ref: rel, url: `https://github.com/ethereum/eth-rnd-archive/blob/master/${rel}` }],
      metadata: { channel, date, messageCount: messages.length }
    });
    record = upsertArtifact(record, await copyArtifactFile({
      repoRoot,
      record,
      sourceFile: file,
      layer: "raw",
      role: "discord-day-snapshot",
      targetFileName: dateFile,
      source: "discord-archive",
      generatedAt
    }));
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "normalized",
      role: "messages",
      fileName: "messages.json",
      body: `${JSON.stringify(messages.map((message) => ({
        author: message.author,
        category: message.category,
        parent: message.parent,
        content: message.content,
        createdAt: message.created_at,
        attachments: message.attachments
      })), null, 2)}\n`,
      source: "discord-archive",
      sourcePath: join(archiveRoot, rel),
      generatedAt,
      from: [`raw/${dateFile}`]
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
