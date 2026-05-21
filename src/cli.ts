#!/usr/bin/env node
import { join } from "node:path";
import { ingest } from "./pipeline/ingest.js";
import { derive } from "./pipeline/derive.js";
import { validate } from "./pipeline/validate.js";
import { buildSnapshot } from "./pipeline/snapshot.js";
import { buildSearchIndex } from "./pipeline/search.js";
import { runEvals } from "./pipeline/evals.js";
import { compactDist } from "./pipeline/compactDist.js";
import { buildSite } from "./site/build.js";
import { nowIso } from "./lib/fs.js";

type Args = Record<string, string | boolean>;

const parseArgs = (argv: string[]): { command: string; args: Args } => {
  const [command = "help", ...rest] = argv;
  const args: Args = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) args[key] = true;
    else {
      args[key] = value;
      index += 1;
    }
  }
  return { command, args };
};

const str = (args: Args, key: string, fallback: string): string =>
  typeof args[key] === "string" ? args[key] : fallback;

const bool = (args: Args, key: string, fallback = false): boolean =>
  typeof args[key] === "boolean" ? args[key] : typeof args[key] === "string" ? args[key].toLowerCase() === "true" : fallback;

const num = (args: Args, key: string, fallback: number): number =>
  typeof args[key] === "string" ? Number.parseInt(args[key], 10) : fallback;

const ingestOptions = (args: Args) => ({
  repoRoot: process.cwd(),
  source: str(args, "source", "all"),
  dummy: bool(args, "dummy", process.env.ENABLE_DUMMY_PIPELINE === "true" && str(args, "source", "") === "dummy"),
  limit: num(args, "limit", 12),
  pmRoot: str(args, "pm-root", process.env.PM_ROOT ?? "/Users/lucy/fun/pm"),
  pmLeanOut: str(args, "pm-lean-out", process.env.PM_LEAN_OUT ?? "/Users/lucy/fun/pm-lean/out"),
  forkcastRoot: str(args, "forkcast-root", process.env.FORKCAST_ROOT ?? "/Users/lucy/fun/forkcast"),
  eipsRoot: str(args, "eips-root", process.env.EIPS_ROOT ?? "/Users/lucy/fun/acd-process/EIPs"),
  ethRndArchiveRoot: str(args, "eth-rnd-archive-root", process.env.ETH_RND_ARCHIVE_ROOT ?? "/Users/lucy/fun/ro-repos/eth-rnd-archive")
});

const help = (): void => {
  console.log(`forkcast-data commands:
  ingest --source canonical|all|eips|forkcast|pm|pm-lean|github-pm-issues|discord-archive|fixture|dummy [--dummy true]
  derive
  backfill
  validate
  build-snapshot
  build-search
  run-evals
  build-site
  compact-dist
  dummy-e2e
`);
};

const main = async (): Promise<void> => {
  const { command, args } = parseArgs(process.argv.slice(2));
  const distRoot = join(process.cwd(), "dist");
  const latestRoot = join(distRoot, "latest");
  switch (command) {
    case "ingest": {
      const records = await ingest(ingestOptions(args));
      console.log(`Ingested ${records.length} records`);
      break;
    }
    case "derive": {
      const records = await derive(process.cwd());
      console.log(`Derived ${records.length} records`);
      break;
    }
    case "backfill": {
      const records = await ingest(ingestOptions(args));
      const derived = await derive(process.cwd());
      console.log(`Backfilled ${records.length} records and derived ${derived.length}`);
      break;
    }
    case "validate": {
      const result = await validate(process.cwd());
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "build-snapshot": {
      const manifest = await buildSnapshot(process.cwd(), distRoot);
      console.log(`Built snapshot ${manifest.snapshot_id}`);
      break;
    }
    case "build-search": {
      const docs = await buildSearchIndex(latestRoot);
      console.log(`Built search index with ${docs.length} documents`);
      break;
    }
    case "run-evals": {
      const result = await runEvals(latestRoot);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "build-site": {
      await buildSite(distRoot);
      console.log("Built data site");
      break;
    }
    case "compact-dist": {
      const result = await compactDist(distRoot);
      console.log(`Compacted dist for snapshot ${result.snapshotId}`);
      break;
    }
    case "publish": {
      console.log("Static site is ready in dist/. Use npx netlify deploy --prod after Netlify link.");
      break;
    }
    case "dispatch-astro": {
      const snapshot = await import("node:fs/promises").then((fs) => fs.readFile(join(latestRoot, "manifest.json"), "utf8"));
      const snapshotId = JSON.parse(snapshot).snapshot_id as string;
      console.log(`Astro dispatch payload: snapshot=${snapshotId}`);
      break;
    }
    case "dummy-e2e": {
      const generatedAt = nowIso();
      await ingest({ ...ingestOptions({ source: "dummy", dummy: true }), dummy: true, source: "dummy", generatedAt });
      await derive(process.cwd(), generatedAt);
      const validation = await validate(process.cwd());
      if (!validation.ok) throw new Error(validation.errors.join("\n"));
      const manifest = await buildSnapshot(process.cwd(), distRoot, generatedAt);
      await buildSearchIndex(latestRoot);
      const evals = await runEvals(latestRoot);
      if (!evals.ok) throw new Error("Fixture evals failed");
      await buildSite(distRoot);
      await compactDist(distRoot);
      console.log(`Dummy e2e complete: ${manifest.snapshot_id}`);
      break;
    }
    default:
      help();
      if (command !== "help") process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
