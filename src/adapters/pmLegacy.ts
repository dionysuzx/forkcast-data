import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { RecordManifest } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import { listFiles, nowIso, readJson, sha256, slugify, unixRelative } from "../lib/fs.js";

const execFileAsync = promisify(execFile);

export const PM_LEGACY_ROOTS = [
  "AllCoreDevs-EL-Meetings",
  "AllCoreDevs-CL-Meetings",
  "Breakout-Room-Meetings",
  "Interop-Notes",
  "Network-Upgrade-Archive",
  "Fusaka",
  "processes"
] as const;

const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".md",
  ".py",
  ".toml",
  ".ts",
  ".tsv",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const sourceCommit = async (pmRoot: string): Promise<string> =>
  execFileAsync("git", ["rev-parse", "HEAD"], { cwd: pmRoot })
    .then((result) => result.stdout.trim())
    .catch(() => "master");

const githubBlobUrl = (commit: string, path: string): string =>
  `https://github.com/ethereum/pm/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 10);

const recordIdForPath = (path: string): string => {
  const extension = extname(path);
  const withoutExtension = extension ? path.slice(0, -extension.length) : path;
  const segments = withoutExtension.split("/").map((segment) => slugify(segment) || "file");
  return `pm-legacy/${segments.join("/")}-${shortHash(path)}`;
};

const titleForPath = (path: string): string => {
  const folder = path.split("/")[0] ?? "PM legacy";
  const name = basename(path, extname(path)).replace(/[-_]+/g, " ");
  return `${folder}: ${name}`;
};

const textSearchBody = async (path: string): Promise<string | null> => {
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  try {
    const text = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    return text.replace(/\u0000/g, "").slice(0, 120_000);
  } catch {
    return null;
  }
};

const fileSize = async (path: string): Promise<number> =>
  import("node:fs/promises").then((fs) => fs.stat(path)).then((info) => info.size);

export const ingestPmLegacyArchive = async (
  repoRoot: string,
  pmRoot: string,
  limit = 0,
  generatedAt = nowIso()
): Promise<RecordManifest[]> => {
  const commit = await sourceCommit(pmRoot);
  const files = (await Promise.all(PM_LEGACY_ROOTS.map((root) => listFiles(join(pmRoot, root)))))
    .flat()
    .concat(await import("node:fs/promises").then((fs) => fs.stat(join(pmRoot, "README.md")).then(() => [join(pmRoot, "README.md")]).catch(() => [])))
    .sort();
  const selected = limit > 0 ? files.slice(0, limit) : files;
  const records: RecordManifest[] = [];

  for (const sourceFile of selected) {
    const sourcePath = unixRelative(pmRoot, sourceFile);
    const size = await fileSize(sourceFile);
    let record = newRecord({
      id: recordIdForPath(sourcePath),
      kind: "topic",
      title: titleForPath(sourcePath),
      generatedAt,
      sources: [{
        type: "pm-legacy",
        ref: sourcePath,
        url: githubBlobUrl(commit, sourcePath),
        metadata: { upstreamCommit: commit, migratedFrom: "ethereum/pm" }
      }],
      metadata: {
        sourcePath,
        upstreamCommit: commit,
        sourceFamily: sourcePath.split("/")[0],
        bytes: size,
        extension: extname(sourcePath).toLowerCase()
      }
    });
    record = upsertArtifact(record, await copyArtifactFile({
      repoRoot,
      record,
      sourceFile,
      layer: "raw",
      role: "pm-legacy-source",
      targetFileName: basename(sourcePath),
      source: "pm-legacy",
      sourcePath: `ethereum/pm:${sourcePath}`,
      sourceUrl: githubBlobUrl(commit, sourcePath),
      generatedAt
    }));
    const searchText = await textSearchBody(sourceFile);
    const normalizedBody = {
      sourcePath,
      upstreamCommit: commit,
      title: record.title,
      bytes: size,
      sha256: record.artifacts.find((artifact) => artifact.role === "pm-legacy-source")?.sha256,
      searchText: searchText ?? `${record.title} ${sourcePath}`
    };
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "normalized",
      role: "source-text",
      fileName: "source-text.json",
      body: `${JSON.stringify(normalizedBody, null, 2)}\n`,
      source: "pm-legacy",
      sourcePath: `ethereum/pm:${sourcePath}`,
      sourceUrl: githubBlobUrl(commit, sourcePath),
      from: ["raw/" + basename(sourcePath)],
      generatedAt
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }

  await writeArtifactText({
    repoRoot,
    record: newRecord({
      id: "pm-legacy/migration-index",
      kind: "topic",
      title: "PM legacy archive migration index",
      generatedAt,
      sources: [{ type: "pm-legacy", ref: "ethereum/pm", url: `https://github.com/ethereum/pm/tree/${commit}` }],
      metadata: { upstreamCommit: commit, fileCount: selected.length }
    }),
    layer: "normalized",
    role: "source-text",
    fileName: "source-text.json",
    body: `${JSON.stringify({
      upstreamCommit: commit,
      migratedAt: generatedAt,
      fileCount: selected.length,
      roots: PM_LEGACY_ROOTS,
      sourceHash: sha256(selected.map((file) => relative(pmRoot, file)).join("\n"))
    }, null, 2)}\n`,
    source: "pm-legacy",
    generatedAt
  }).then(async (artifact) => {
    const migration = upsertArtifact(newRecord({
      id: "pm-legacy/migration-index",
      kind: "topic",
      title: "PM legacy archive migration index",
      generatedAt,
      sources: [{ type: "pm-legacy", ref: "ethereum/pm", url: `https://github.com/ethereum/pm/tree/${commit}` }],
      metadata: { upstreamCommit: commit, fileCount: selected.length, roots: [...PM_LEGACY_ROOTS] }
    }), artifact);
    await writeRecord(repoRoot, migration);
    records.push(await readJson<RecordManifest>(join(repoRoot, "records", "topic", "pm-legacy", "migration-index", "manifest.json")));
  });

  await writeCatalog(repoRoot, generatedAt);
  return records;
};
