#!/usr/bin/env node
import { join } from "node:path";
import { callTool, toolDefinitions } from "./tools.js";

const latestRoot = process.env.FORKCAST_DATA_LATEST_ROOT ?? join(process.cwd(), "dist", "latest");

process.stdin.setEncoding("utf8");

let buffer = "";

const send = (id: unknown, result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

const fail = (id: unknown, error: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
};

const handle = async (message: { id?: unknown; method?: string; params?: Record<string, unknown> }): Promise<void> => {
  const id = message.id ?? null;
  try {
    if (message.method === "initialize") {
      send(id, { protocolVersion: "2024-11-05", serverInfo: { name: "forkcast-data", version: "0.1.0" }, capabilities: { tools: {}, resources: {} } });
      return;
    }
    if (message.method === "tools/list") {
      send(id, { tools: toolDefinitions });
      return;
    }
    if (message.method === "tools/call") {
      const params = message.params ?? {};
      const result = await callTool({ latestRoot }, String(params.name), (params.arguments ?? {}) as Record<string, unknown>);
      send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      return;
    }
    if (message.method === "resources/list") {
      send(id, { resources: [{ uri: "forkcast://latest/catalog", name: "Forkcast latest catalog", mimeType: "application/json" }] });
      return;
    }
    if (message.method === "resources/read") {
      send(id, { contents: [{ uri: "forkcast://latest/catalog", mimeType: "application/json", text: await import("node:fs/promises").then((fs) => fs.readFile(join(latestRoot, "catalog.json"), "utf8")) }] });
      return;
    }
    send(id, {});
  } catch (error) {
    fail(id, error);
  }
};

process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines.filter(Boolean)) {
    void handle(JSON.parse(line) as { id?: unknown; method?: string; params?: Record<string, unknown> });
  }
});
