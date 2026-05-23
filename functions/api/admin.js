const encoder = new TextEncoder();

const json = (body, init = {}) =>
  Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers ?? {})
    }
  });

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const isAuthorized = async (request, env) => {
  const header = request.headers.get("authorization") ?? "";
  if (env.ADMIN_TOKEN && header === `Bearer ${env.ADMIN_TOKEN}`) return true;
  if (!env.ADMIN_PASSWORD_HASH) return false;
  const password = request.headers.get("x-admin-password");
  if (!password) return false;
  return constantTimeEqual(await sha256Hex(password), env.ADMIN_PASSWORD_HASH);
};

const readStaticJson = async (request, path, fallback) => {
  try {
    const response = await fetch(new URL(`/latest/${path}`, request.url));
    return response.ok ? await response.json() : fallback;
  } catch {
    return fallback;
  }
};

const controls = (authed, env) => ({
  ingestCanonical: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN"], description: "Run canonical ingest and deploy Cloudflare Pages." },
  ingestFull: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN"], description: "Run full backfill source=all." },
  evals: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN"], description: "Run eval-gated pipeline." },
  snapshot: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN"], description: "Force snapshot rebuild and data deploy." },
  dataDeploy: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN"], description: "Run manual Cloudflare data deploy workflow." },
  astroRebuild: { enabled: authed && Boolean(env.GITHUB_TOKEN), requiredSecrets: ["GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN"], description: "Run Astro Cloudflare rebuild." }
});

const secretStatus = (env) => ({
  hasAdminToken: Boolean(env.ADMIN_TOKEN),
  hasAdminPasswordHash: Boolean(env.ADMIN_PASSWORD_HASH),
  hasGitHubToken: Boolean(env.GITHUB_TOKEN),
  hasCloudflareToken: Boolean(env.CLOUDFLARE_API_TOKEN),
  requiredForActions: ["ADMIN_TOKEN or ADMIN_PASSWORD_HASH", "GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN"]
});

const dispatchWorkflow = async (env, repo, workflow, inputs) => {
  if (!env.GITHUB_TOKEN) return json({ ok: false, error: "missing GITHUB_TOKEN" }, { status: 400 });
  const response = await fetch(`https://api.github.com/repos/dionysuzx/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref: "main", inputs })
  });
  if (!response.ok) return json({ ok: false, error: `GitHub dispatch failed: ${response.status}` }, { status: 502 });
  return json({ ok: true, dispatched: { repo, workflow, inputs } });
};

export const onRequest = async ({ request, env }) => {
  const authed = await isAuthorized(request, env);
  if (!authed && request.method !== "GET") return json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    switch (body.action) {
      case "ingestCanonical":
        return dispatchWorkflow(env, "forkcast-data", "data-pipeline.yml", {
          source: "canonical",
          source_limit: "0",
          dummy_mode: false,
          force_rebuild: true,
          eval_bypass_reason: ""
        });
      case "ingestFull":
      case "evals":
      case "snapshot":
        return dispatchWorkflow(env, "forkcast-data", "data-pipeline.yml", {
          source: "all",
          source_limit: "0",
          dummy_mode: false,
          force_rebuild: true,
          eval_bypass_reason: ""
        });
      case "dataDeploy":
        return dispatchWorkflow(env, "forkcast-data", "deploy-cloudflare.yml", { force_rebuild: true });
      case "astroRebuild":
        return dispatchWorkflow(env, "forkcast-astro", "snapshot-rebuild.yml", {
          target_snapshot: body.targetSnapshot ?? "",
          force_rebuild: true,
          deploy_target: "cloudflare"
        });
      default:
        return json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  }

  const [manifest, stats, evals] = await Promise.all([
    readStaticJson(request, "manifest.json", {}),
    readStaticJson(request, "stats.json", {}),
    readStaticJson(request, "evals/results.json", { ok: false, results: [] })
  ]);
  return json({
    ok: true,
    authorized: authed,
    status: {
      manifest,
      stats,
      sources: "forkcast-data owns canonical ingest; pm-lean is optional source input only",
      evals: "fixture gate required before snapshot publication",
      search: "static weighted shards on Cloudflare Pages",
      mcp: "read-only stdio server over latest snapshot"
    },
    evals,
    controls: controls(authed, env),
    secrets: secretStatus(env)
  });
};
