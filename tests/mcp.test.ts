import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SearchDocument } from "../src/domain/types.js";
import { writeJson } from "../src/lib/fs.js";
import { getEip, searchForkcast, traceFact } from "../src/mcp/tools.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.length = 0;
});

const latestRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "forkcast-mcp-test-"));
  dirs.push(root);
  await mkdir(join(root, "search"), { recursive: true });
  await mkdir(join(root, "eips"), { recursive: true });
  const docs: SearchDocument[] = [{
    id: "eip-7702",
    kind: "eip",
    title: "EIP-7702",
    body: "Wallet delegation impact",
    url: "/latest/eips/7702.json",
    tags: ["EIP-7702"],
    citations: [{ recordId: "eip-7702", artifactPath: "normalized/7702.json", url: "/records/proposal/eip-7702/normalized/7702.json", label: "EIP-7702" }]
  }];
  await writeJson(join(root, "search", "index.json"), docs);
  await writeJson(join(root, "eips", "7702.json"), { id: 7702, title: "EIP-7702" });
  return root;
};

describe("MCP tools", () => {
  it("returns structured data and provenance citations", async () => {
    const root = await latestRoot();
    expect((await getEip({ latestRoot: root }, 7702)).id).toBe(7702);
    expect((await searchForkcast({ latestRoot: root }, "wallet")).results[0]?.citations[0]?.recordId).toBe("eip-7702");
    expect((await traceFact({ latestRoot: root }, "wallet impact")).traces[0]?.url).toContain("/records/");
  });
});
