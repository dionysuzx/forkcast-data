import { cp, readdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { readJson, writeText } from "../lib/fs.js";

const execFileAsync = promisify(execFile);

const currentCommit = async (repoRoot: string): Promise<string> => {
  const fromGit = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
    .then((result) => result.stdout.trim())
    .catch(() => "");
  return fromGit || process.env.GITHUB_SHA || "main";
};

type SnapshotIndex = {
  latest: string;
};

export type CompactDistResult = {
  snapshotId: string;
};

export const compactDist = async (distRoot: string): Promise<CompactDistResult> => {
  const repoRoot = join(distRoot, "..");
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
  await rm(join(snapshotRoot, "records"), { recursive: true, force: true });
  await rm(latestRoot, { recursive: true, force: true });

  const commit = await currentCommit(repoRoot);
  const rawRecords = `https://raw.githubusercontent.com/dionysuzx/forkcast-data/${commit}/records/:splat`;

  await writeText(join(distRoot, "_redirects"), [
    `/latest/records/* ${rawRecords} 302`,
    `/latest/* /snapshots/${snapshotId}/:splat 200`,
    `/snapshots/${snapshotId}/records/* ${rawRecords} 302`,
    `/records/* ${rawRecords} 302`,
    `/catalog.json /snapshots/${snapshotId}/catalog.json 200`,
    `/manifest.json /snapshots/${snapshotId}/manifest.json 200`,
    ""
  ].join("\n"));

  return { snapshotId };
};
