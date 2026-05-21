import { cp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeText } from "../lib/fs.js";

type SnapshotIndex = {
  latest: string;
};

export type CompactDistResult = {
  snapshotId: string;
};

export const compactDist = async (distRoot: string): Promise<CompactDistResult> => {
  const snapshotsRoot = join(distRoot, "snapshots");
  const index = await readJson<SnapshotIndex>(join(snapshotsRoot, "index.json"));
  const snapshotId = index.latest;
  if (!snapshotId) throw new Error("Cannot compact dist without snapshots/index.json latest");

  const latestRoot = join(distRoot, "latest");
  const snapshotRoot = join(snapshotsRoot, snapshotId);
  const latestInfo = await stat(latestRoot).catch(() => null);
  const snapshotInfo = await stat(snapshotRoot).catch(() => null);
  if (!latestInfo?.isDirectory()) throw new Error("Cannot compact dist before latest read models are built");
  if (!snapshotInfo?.isDirectory()) throw new Error(`Cannot compact dist; missing snapshot ${snapshotId}`);

  await cp(latestRoot, snapshotRoot, { recursive: true, force: true });

  for (const entry of await readdir(snapshotsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== snapshotId) {
      await rm(join(snapshotsRoot, entry.name), { recursive: true, force: true });
    }
  }

  await rm(join(distRoot, "records"), { recursive: true, force: true });
  await rm(latestRoot, { recursive: true, force: true });

  await writeText(join(distRoot, "_redirects"), [
    `/latest/* /snapshots/${snapshotId}/:splat 200`,
    `/records/* /snapshots/${snapshotId}/records/:splat 200`,
    `/catalog.json /snapshots/${snapshotId}/catalog.json 200`,
    `/manifest.json /snapshots/${snapshotId}/manifest.json 200`,
    ""
  ].join("\n"));

  return { snapshotId };
};
