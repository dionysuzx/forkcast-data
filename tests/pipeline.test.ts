import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestDummy } from "../src/adapters/dummy.js";
import { derive } from "../src/pipeline/derive.js";
import { buildSnapshot } from "../src/pipeline/snapshot.js";
import { buildSearchIndex, searchDocuments } from "../src/pipeline/search.js";
import { compactDist } from "../src/pipeline/compactDist.js";
import { validate } from "../src/pipeline/validate.js";
import { readJson } from "../src/lib/fs.js";
import type { SearchDocument } from "../src/domain/types.js";
import { newRecord, upsertArtifact, writeArtifactText, writeRecord } from "../src/domain/record.js";

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
    const call = await readJson<{ summary: string }>(join(repo, "dist", "latest", "calls", "dummy-acde", "1.json"));
    expect(call.summary).toContain("Dummy EIPs moved to SFI");
    expect(call.summary).not.toContain("fakeData");
    const eip = await readJson<{ id: number }>(join(repo, "dist", "latest", "eips", "7702.json"));
    expect(eip.id).toBe(7702);
    await compactDist(join(repo, "dist"));
    await expect(readJson(join(repo, "dist", "snapshots", manifest.snapshot_id, "eips", "7702.json"))).resolves.toMatchObject({ id: 7702 });
    await expect(readJson(join(repo, "dist", "latest", "eips", "7702.json"))).rejects.toThrow();
  });

  it("keeps derived call intelligence stable across identical derives", async () => {
    process.env.ENABLE_DUMMY_PIPELINE = "true";
    const repo = await tempRepo();
    await ingestDummy(repo, "2099-01-01T00:00:00.000Z");
    await derive(repo, "2099-01-01T00:00:00.000Z");
    const manifestPath = join(repo, "records", "call", "dummy-acde", "2099.01.01-1", "manifest.json");
    const first = await readJson<{ artifacts: Array<{ path: string; sha256: string; from?: string[] }> }>(manifestPath);
    const firstArtifact = first.artifacts.find((artifact) => artifact.path === "derived/call-intelligence.json");
    expect(firstArtifact?.from).not.toContain("derived/call-intelligence.json");

    await derive(repo, "2099-01-02T00:00:00.000Z");
    const second = await readJson<{ artifacts: Array<{ path: string; sha256: string; from?: string[] }> }>(manifestPath);
    const secondArtifact = second.artifacts.find((artifact) => artifact.path === "derived/call-intelligence.json");
    expect(secondArtifact?.sha256).toBe(firstArtifact?.sha256);
    expect(secondArtifact?.from).not.toContain("derived/call-intelligence.json");
  });

  it("derives readable call summaries from structured agenda artifacts", async () => {
    const repo = await tempRepo();
    let record = newRecord({
      id: "acde/2099.01.02-2",
      kind: "call",
      title: "All Core Devs - Execution (ACDE) #2",
      generatedAt: "2099-01-02T00:00:00.000Z",
      sources: [{ type: "github-pm-issues", ref: "ethereum/pm#2" }]
    });
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot: repo,
      record,
      layer: "normalized",
      role: "agenda",
      fileName: "agenda.json",
      body: `${JSON.stringify({
        issue: 2,
        title: "All Core Devs - Execution (ACDE) #2",
        agendaMarkdown: "- Glamsterdam\n  - EIP-7702 delegation UX follow-up"
      }, null, 2)}\n`,
      source: "github-pm-issues",
      generatedAt: "2099-01-02T00:00:00.000Z"
    }));
    await writeRecord(repo, record);
    await derive(repo, "2099-01-02T00:10:00.000Z");
    const manifest = await buildSnapshot(repo, join(repo, "dist"), "2099-01-02T00:10:00.000Z");
    const call = await readJson<{ summary: string }>(join(repo, "dist", "latest", "calls", "acde", "2.json"));
    expect(call.summary).toContain("Glamsterdam");
    expect(call.summary).toContain("EIP-7702");
    expect(call.summary).not.toContain("\"agendaMarkdown\"");
    const docs = await buildSearchIndex(join(repo, "dist", "latest"));
    const hit = searchDocuments(docs, "Glamsterdam 7702", 3)[0];
    expect(hit?.id).toBe("acde/2099.01.02-2");
    await compactDist(join(repo, "dist"));
    await expect(readJson(join(repo, "dist", "snapshots", manifest.snapshot_id, "calls", "acde", "2.json"))).resolves.toMatchObject({ id: "acde/2099.01.02-2" });
  });
});
