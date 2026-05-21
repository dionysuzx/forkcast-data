import { join } from "node:path";
import type { RecordManifest } from "../domain/types.js";
import { newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { listFiles, nowIso, pathExists, readJson, sha256, slugify } from "../lib/fs.js";

interface DiscordMessage {
  author?: string;
  category?: string;
  parent?: string;
  content?: string;
  created_at?: string;
  timestamp?: string;
  attachments?: unknown[];
}

const normalizedMessage = (message: DiscordMessage) => ({
  author: message.author ?? "unknown",
  category: message.category ?? "",
  parent: message.parent ?? "",
  content: message.content ?? "",
  createdAt: message.created_at ?? message.timestamp ?? "",
  attachments: Array.isArray(message.attachments) ? message.attachments : []
});

const compactText = (value: string, length: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, length);

const pathSlug = (value: string): string => {
  let output = "";
  for (const char of value.toLowerCase()) {
    if (/[a-z0-9]/.test(char)) output += char;
    else if (char === "-" || char === "_" || /\s/.test(char)) {
      if (!output.endsWith("-")) output += "-";
    } else {
      if (!output.endsWith("-")) output += "-";
      output += `u${char.codePointAt(0)?.toString(16) ?? "unknown"}-`;
    }
  }
  return output.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
};

export const ingestDiscordArchive = async (repoRoot: string, archiveRoot: string, limit = 12, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  if (!(await pathExists(archiveRoot))) return [];
  const candidateFiles = (await listFiles(archiveRoot))
    .filter((file) => !file.includes("/.git/"))
    .filter((file) => /\/20\d\d-\d\d-\d\d\.json$/.test(file));
  const selectedFiles = limit > 0 ? candidateFiles.slice(-limit) : candidateFiles;
  const records: RecordManifest[] = [];
  for (const file of selectedFiles) {
    const rel = file.slice(archiveRoot.length + 1);
    const relParts = rel.split("/");
    const dateFile = relParts.at(-1) ?? "unknown.json";
    const channel = relParts.slice(0, -1).join("/") || "unknown";
    const date = dateFile.replace(/\.json$/, "");
    const messages = await readJson<DiscordMessage[]>(file);
    const normalized = messages.map(normalizedMessage);
    const searchText = compactText(normalized.map((message) => message.content).join(" "), 12000);
    const sourceText = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
    const sourceHash = sha256(sourceText);
    const channelParts = channel.split("/");
    const channelPath = channelParts
      .map((part, index) => index === 0 ? pathSlug(part) : slugify(part) || "unknown")
      .join("/");
    let record = newRecord({
      id: `discord-archive/${channelPath}/${date}`,
      kind: "thread",
      title: `${channel} Discord archive ${date}`,
      generatedAt,
      sources: [{ type: "discord-archive", ref: rel, url: `https://github.com/ethereum/eth-rnd-archive/blob/master/${rel}` }],
      metadata: { channel, date, messageCount: messages.length, sourceHash }
    });
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "raw",
      role: "discord-source-observation",
      fileName: "source.json",
      body: `${JSON.stringify({
        sourcePath: file,
        sourceUrl: `https://github.com/ethereum/eth-rnd-archive/blob/master/${rel}`,
        sourceHash,
        channel,
        date,
        messageCount: messages.length,
        note: "Raw Discord archive JSON remains inspectable at sourcePath/sourceUrl; normalized searchable messages are stored under normalized/messages.json."
      }, null, 2)}\n`,
      source: "discord-archive",
      sourcePath: file,
      generatedAt
    }));
    const storeFullMessages = process.env.FORKCAST_DATA_FULL_DISCORD_MESSAGES === "true";
    const normalizedBody = {
      schemaVersion: 1,
      channel,
      date,
      messageCount: normalized.length,
      sourceHash,
      searchText,
      excerpts: normalized.slice(0, 120),
      messages: storeFullMessages ? normalized : undefined
    };
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "normalized",
      role: "messages",
      fileName: "messages.json",
      body: `${JSON.stringify(normalizedBody, null, 2)}\n`,
      source: "discord-archive",
      sourcePath: join(archiveRoot, rel),
      generatedAt,
      from: ["raw/source.json"]
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
