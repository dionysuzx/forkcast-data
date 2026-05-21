import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestDummy } from "../src/adapters/dummy.js";
import { derive } from "../src/pipeline/derive.js";
import { buildSnapshot } from "../src/pipeline/snapshot.js";
import { buildSearchIndex, searchDocuments } from "../src/pipeline/search.js";
import { validate } from "../src/pipeline/validate.js";
import { readJson } from "../src/lib/fs.js";
import type { SearchDocument } from "../src/domain/types.js";

const dirs: string[] = [];

const tempRepo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "forkcast-data-test-"));
  dirs.push(dir);
  await import("node:fs/promises").then(async (fs) => {
    await fs.cp(join(process.cwd(), "schemas"), join(dir, "schemas"), { recursive: true });
  });
  return dir;
};

afterEach(async () => {
  delete process.env.ENABLE_DUMMY_PIPELINE;
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.length = 0;
});

describe("data pipeline", () => {
  it("builds a valid dummy snapshot and searchable read model", async () => {
    process.env.ENABLE_DUMMY_PIPELINE = "true";
    const repo = await tempRepo();
    await ingestDummy(repo, "2099-01-01T00:00:00.000Z");
    await derive(repo, "2099-01-01T00:00:00.000Z");
    expect((await validate(repo)).ok).toBe(true);
    const manifest = await buildSnapshot(repo, join(repo, "dist"), "2099-01-01T00:00:00.000Z");
    expect(manifest.record_count).toBeGreaterThan(0);
    const docs = await buildSearchIndex(join(repo, "dist", "latest"));
    const hit = searchDocuments(docs, "BAL decision", 3)[0];
    expect(`${hit?.title} ${hit?.body}`).toContain("BAL");
    const eip = await readJson<{ id: number }>(join(repo, "dist", "latest", "eips", "7702.json"));
    expect(eip.id).toBe(7702);
  });
});
