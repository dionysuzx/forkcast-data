import { join } from "node:path";
import { readJson } from "../lib/fs.js";
import type { CallReadModel, DecisionReadModel, EipReadModel, SearchDocument } from "../domain/types.js";
import { searchDocuments } from "../pipeline/search.js";

export interface ToolContext {
  latestRoot: string;
}

export const searchForkcast = async (ctx: ToolContext, query: string) => {
  const docs = await readJson<SearchDocument[]>(join(ctx.latestRoot, "search", "index.json"));
  return { results: searchDocuments(docs, query, 8) };
};

export const getEip = async (ctx: ToolContext, id: number) =>
  readJson<EipReadModel>(join(ctx.latestRoot, "eips", `${id}.json`));

export const getUpgrade = async (ctx: ToolContext, id: string) =>
  readJson<unknown>(join(ctx.latestRoot, "upgrades", `${id}.json`));

export const getCall = async (ctx: ToolContext, series: string, number: number) =>
  readJson<CallReadModel>(join(ctx.latestRoot, "calls", series, `${number}.json`));

export const getDecisions = async (ctx: ToolContext, query = "") => {
  const text = await import("node:fs/promises").then((fs) => fs.readFile(join(ctx.latestRoot, "decisions", "index.ndjson"), "utf8"));
  const decisions = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as DecisionReadModel);
  const lower = query.toLowerCase();
  return { decisions: lower ? decisions.filter((decision) => decision.title.toLowerCase().includes(lower)) : decisions };
};

export const getDevnet = async (ctx: ToolContext, id: string) =>
  readJson<unknown>(join(ctx.latestRoot, "devnets", `${id}.json`));

export const traceFact = async (ctx: ToolContext, claim: string) => {
  const search = await searchForkcast(ctx, claim);
  return {
    claim,
    traces: search.results.flatMap((result) => result.citations).slice(0, 5)
  };
};

export const toolDefinitions = [
  { name: "search_forkcast", description: "Search Forkcast records with citations.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_upgrade", description: "Get an upgrade read model.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "get_eip", description: "Get an EIP read model.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "get_call", description: "Get a call read model.", inputSchema: { type: "object", properties: { series: { type: "string" }, number: { type: "number" } }, required: ["series", "number"] } },
  { name: "get_decisions", description: "Get decisions, optionally filtered.", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
  { name: "get_devnet", description: "Get devnet status.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "trace_fact", description: "Trace a claim to source artifacts.", inputSchema: { type: "object", properties: { claim: { type: "string" } }, required: ["claim"] } }
];

export const callTool = async (ctx: ToolContext, name: string, args: Record<string, unknown>) => {
  switch (name) {
    case "search_forkcast": return searchForkcast(ctx, String(args.query));
    case "get_upgrade": return getUpgrade(ctx, String(args.id));
    case "get_eip": return getEip(ctx, Number(args.id));
    case "get_call": return getCall(ctx, String(args.series), Number(args.number));
    case "get_decisions": return getDecisions(ctx, typeof args.query === "string" ? args.query : "");
    case "get_devnet": return getDevnet(ctx, String(args.id));
    case "trace_fact": return traceFact(ctx, String(args.claim));
    default: throw new Error(`Unknown MCP tool: ${name}`);
  }
};
