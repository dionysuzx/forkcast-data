import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 5174);
const distRoot = join(process.cwd(), "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ndjson": "application/x-ndjson; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const resolvePath = async (urlPath: string): Promise<string | null> => {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(distRoot, clean === "/" ? "index.html" : clean);
  const file = await stat(filePath).catch(() => null);
  if (file?.isFile()) return filePath;
  const index = join(filePath, "index.html");
  const indexFile = await stat(index).catch(() => null);
  if (indexFile?.isFile()) return index;

  const snapshotIndex = await readFile(join(distRoot, "snapshots", "index.json"), "utf8")
    .then((body) => JSON.parse(body) as { latest?: string })
    .catch(() => null);
  const latest = snapshotIndex?.latest;
  if (!latest) return null;

  if (clean.startsWith("/latest/")) {
    return resolvePath(`/snapshots/${latest}/${clean.slice("/latest/".length)}`);
  }
  if (clean.startsWith("/records/")) {
    const snapshotRecord = await resolvePath(`/snapshots/${latest}/records/${clean.slice("/records/".length)}`);
    if (snapshotRecord) return snapshotRecord;
    const repoRecord = join(process.cwd(), clean);
    const repoRecordFile = await stat(repoRecord).catch(() => null);
    return repoRecordFile?.isFile() ? repoRecord : null;
  }
  return null;
};

createServer(async (request, response) => {
  const filePath = await resolvePath(request.url ?? "/");
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Forkcast data site listening on http://localhost:${port}`);
});
