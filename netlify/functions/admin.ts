import type { Config } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adminSecretStatus, isAuthorized } from "./_shared/admin-auth.js";

type AdminAction = "ingestCanonical" | "ingestFull" | "evals" | "snapshot" | "dataDeploy" | "astroRebuild";

const env = (key: string): string | undefined => Netlify.env.get(key) ?? undefined;

const controls = (authed: boolean) => ({
  ingestCanonical: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN"], description: "Run canonical ingest: EIPs, Forkcast, PM, PM issues, eth-rnd archive, Magicians links." },
  ingestFull: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN"], description: "Run full backfill source=all." },
  evals: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN"], description: "Run eval-gated pipeline with fixture judge." },
  snapshot: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN"], description: "Force snapshot rebuild and data deploy." },
  dataDeploy: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN", "NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"] },
  astroRebuild: { enabled: authed && Boolean(env("GITHUB_TOKEN")), requiredSecrets: ["GITHUB_TOKEN"] }
});

const readStaticJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "dist", "latest", path), "utf8")) as T;
  } catch {
    return fallback;
  }
};

const dispatchWorkflow = async (repo: string, workflow: string, inputs: Record<string, string | boolean>): Promise<Response> => {
  const token = env("GITHUB_TOKEN");
  if (!token) {
    return Response.json({ ok: false, error: "missing GITHUB_TOKEN" }, { status: 400 });
  }
  const response = await fetch(`https://api.github.com/repos/dionysuzx/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref: "main", inputs })
  });
  if (!response.ok) {
    return Response.json({ ok: false, error: `GitHub dispatch failed: ${response.status}` }, { status: 502 });
  }
  return Response.json({ ok: true, dispatched: { repo, workflow, inputs } }, {
    headers: { "Cache-Control": "private, no-store" }
  });
};

export default async (request: Request) => {
  const authed = await isAuthorized(request);
  if (!authed && request.method !== "GET") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { action?: AdminAction; targetSnapshot?: string };
    switch (body.action) {
      case "ingestCanonical":
        return dispatchWorkflow("forkcast-data", "data-pipeline.yml", {
          source: "canonical",
          dummy_mode: false,
          force_rebuild: true,
          eval_bypass_reason: ""
        });
      case "ingestFull":
      case "evals":
      case "snapshot":
        return dispatchWorkflow("forkcast-data", "data-pipeline.yml", {
          source: "all",
          dummy_mode: false,
          force_rebuild: true,
          eval_bypass_reason: ""
        });
      case "dataDeploy":
        return dispatchWorkflow("forkcast-data", "deploy-netlify.yml", { deploy_target: "prod" });
      case "astroRebuild":
        return dispatchWorkflow("forkcast-astro", "snapshot-rebuild.yml", {
          target_snapshot: body.targetSnapshot ?? "latest",
          force_rebuild: true,
          deploy_target: "prod"
        });
      default:
        return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  }
  const missing = adminSecretStatus();
  const stats = await readStaticJson("stats.json", {});
  const evals = await readStaticJson("evals/results.json", { ok: false, results: [] });
  const manifest = await readStaticJson("manifest.json", {});
  return Response.json({
    ok: true,
    authorized: authed,
    status: {
      manifest,
      stats,
      sources: "forkcast-data owns canonical ingest; pm-lean is optional source input only",
      evals: "fixture gate required; optional judge keys can be added later",
      search: "static weighted index plus function fallback",
      mcp: "read-only stdio server over latest snapshot"
    },
    evals,
    controls: controls(authed),
    secrets: missing
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
};

export const config: Config = {
  path: "/api/admin"
};
