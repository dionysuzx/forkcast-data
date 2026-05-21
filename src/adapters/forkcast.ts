import { join } from "node:path";
import type { RecordManifest } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeCatalog, writeRecord } from "../domain/record.js";
import { nowIso, pathExists, readJson } from "../lib/fs.js";

const EIPS = [7702, 7732, 7928, 7778, 7843, 8024, 8037, 7954, 7976, 7981, 8182, 8253, 4758];

const UPGRADES = [
  {
    id: "glamsterdam",
    name: "Glamsterdam Upgrade",
    status: "Upcoming",
    summary: "Scoping complete; implemented EIPs are being tested on devnets.",
    eips: [7708, 7732, 7778, 7843, 7928, 7954, 7976, 7981, 8024, 8037]
  },
  {
    id: "hegota",
    name: "Hegotá Upgrade",
    status: "Planning",
    summary: "Future network upgrade in planning with candidate proposal discussion.",
    eips: [8182, 8253, 4758]
  },
  {
    id: "pectra",
    name: "Pectra Upgrade",
    status: "Live",
    summary: "Included EIP-7702 and validator experience improvements.",
    eips: [7702]
  }
];

export const ingestForkcast = async (repoRoot: string, forkcastRoot: string, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const records: RecordManifest[] = [];
  for (const eip of EIPS) {
    const sourceFile = join(forkcastRoot, "src", "data", "eips", `${eip}.json`);
    if (!(await pathExists(sourceFile))) continue;
    const source = await readJson<{ title?: string; status?: string; description?: string }>(sourceFile);
    let record = newRecord({
      id: `eip-${eip}`,
      kind: "proposal",
      title: source.title ?? `EIP-${eip}`,
      generatedAt,
      sources: [{ type: "forkcast", ref: `src/data/eips/${eip}.json`, url: `https://github.com/ethereum/forkcast/blob/main/src/data/eips/${eip}.json` }],
      metadata: { eip, status: source.status, description: source.description }
    });
    record = upsertArtifact(record, await copyArtifactFile({
      repoRoot,
      record,
      sourceFile,
      layer: "normalized",
      role: "proposal",
      targetFileName: `${eip}.json`,
      source: "forkcast",
      generatedAt
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }

  for (const upgrade of UPGRADES) {
    let record = newRecord({
      id: upgrade.id,
      kind: "upgrade",
      title: upgrade.name,
      generatedAt,
      sources: [{ type: "forkcast", ref: "src/data/upgrades.ts", url: "https://github.com/ethereum/forkcast/blob/main/src/data/upgrades.ts" }],
      metadata: upgrade
    });
    record = upsertArtifact(record, await copyArtifactFile({
      repoRoot,
      record,
      sourceFile: join(forkcastRoot, "src", "data", "upgrades.ts"),
      layer: "raw",
      role: "forkcast-upgrades-source",
      targetFileName: "upgrades.ts",
      source: "forkcast",
      generatedAt
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }

  const devnetIndex = join(forkcastRoot, "src", "data", "devnets", "glamsterdam.json");
  if (await pathExists(devnetIndex)) {
    const index = await readJson<{ devnets: Array<{ id: string }> }>(devnetIndex);
    for (const devnet of index.devnets.slice(-10)) {
      const sourceFile = join(forkcastRoot, "src", "data", "devnets", `${devnet.id}.json`);
      let record = newRecord({
        id: devnet.id,
        kind: "devnet",
        title: devnet.id,
        generatedAt,
        sources: [{ type: "forkcast", ref: `src/data/devnets/${devnet.id}.json` }],
        metadata: devnet
      });
      if (await pathExists(sourceFile)) {
        record = upsertArtifact(record, await copyArtifactFile({
          repoRoot,
          record,
          sourceFile,
          layer: "normalized",
          role: "devnet",
          targetFileName: `${devnet.id}.json`,
          source: "forkcast",
          generatedAt
        }));
      }
      await writeRecord(repoRoot, record);
      records.push(record);
    }
  }

  await writeCatalog(repoRoot, generatedAt);
  return records;
};
