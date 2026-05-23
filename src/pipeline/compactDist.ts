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
  const staticHost = (process.env.FORKCAST_STATIC_HOST ?? "cloudflare-pages").trim().toLowerCase();
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
  await rm(join(snapshotRoot, "search", "index.json"), { force: true });

  const commit = await currentCommit(repoRoot);
  const rawRecords = `https://raw.githubusercontent.com/dionysuzx/forkcast-data/${commit}/records/:splat`;

  if (staticHost === "github-pages") {
    await writeText(join(distRoot, ".nojekyll"), "");
    await rm(join(distRoot, "_redirects"), { force: true });
    await writeText(join(distRoot, "404.html"), [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      "<title>Forkcast Data Not Found</title></head>",
      "<body><main><h1>Forkcast Data path not found</h1>",
      `<p>Use the latest snapshot at <a href="./latest/manifest.json">latest/manifest.json</a> or immutable snapshot <a href="./snapshots/${snapshotId}/manifest.json">${snapshotId}</a>.</p>`,
      "</main></body></html>"
    ].join(""));
  } else {
    await rm(latestRoot, { recursive: true, force: true });
    await writeText(join(distRoot, "_redirects"), [
      `/latest/records/* ${rawRecords} 302`,
      `/latest/* /snapshots/${snapshotId}/:splat 200`,
      `/snapshots/${snapshotId}/records/* ${rawRecords} 302`,
      `/records/* ${rawRecords} 302`,
      `/catalog.json /snapshots/${snapshotId}/catalog.json 200`,
      `/manifest.json /snapshots/${snapshotId}/manifest.json 200`,
      ""
    ].join("\n"));
    await writeText(join(distRoot, "_headers"), [
      "/snapshots/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "/latest/*",
      "  Cache-Control: public, max-age=60, stale-while-revalidate=300",
      "/catalog.json",
      "  Cache-Control: public, max-age=60, stale-while-revalidate=300",
      "/manifest.json",
      "  Cache-Control: public, max-age=60, stale-while-revalidate=300",
      "/api/*",
      "  Cache-Control: private, no-store",
      ""
    ].join("\n"));
  }

  return { snapshotId };
};
