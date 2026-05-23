import type { Config } from "@netlify/functions";
import { schedulerTargets, shouldDispatch, type SchedulerDecision, type WorkflowRun, type WorkflowTarget } from "./_shared/workflow-scheduler.js";

const env = (key: string): string | undefined => Netlify.env.get(key) ?? undefined;

const headers = (token: string): HeadersInit => ({
  "Accept": "application/vnd.github+json",
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const workflowRuns = async (token: string, target: WorkflowTarget): Promise<WorkflowRun[]> => {
  const url = new URL(`https://api.github.com/repos/dionysuzx/${target.repo}/actions/workflows/${target.workflow}/runs`);
  url.searchParams.set("branch", "main");
  url.searchParams.set("per_page", "10");
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) throw new Error(`run list failed for ${target.repo}: ${response.status}`);
  const body = await response.json() as { workflow_runs?: WorkflowRun[] };
  return body.workflow_runs ?? [];
};

const dispatchWorkflow = async (token: string, target: WorkflowTarget): Promise<void> => {
  const response = await fetch(`https://api.github.com/repos/dionysuzx/${target.repo}/actions/workflows/${target.workflow}/dispatches`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ ref: "main", inputs: target.inputs })
  });
  if (!response.ok) throw new Error(`dispatch failed for ${target.repo}: ${response.status}`);
};

export default async () => {
  if (env("FORKCAST_SCHEDULER_DISABLED") === "true") {
    console.log("forkcast scheduler disabled by FORKCAST_SCHEDULER_DISABLED");
    return Response.json({ ok: true, disabled: true }, { status: 200 });
  }

  const token = env("GITHUB_TOKEN");
  if (!token) {
    console.log("forkcast scheduler skipped: missing GITHUB_TOKEN");
    return Response.json({ ok: false, error: "missing GITHUB_TOKEN" }, { status: 200 });
  }

  const now = new Date();
  const decisions: Array<SchedulerDecision & { dispatched?: boolean; error?: string }> = [];
  for (const target of schedulerTargets) {
    try {
      const runs = await workflowRuns(token, target);
      const decision = shouldDispatch(target, runs, now);
      if (decision.action === "dispatch") {
        await dispatchWorkflow(token, target);
        decisions.push({ ...decision, dispatched: true });
      } else {
        decisions.push({ ...decision, dispatched: false });
      }
    } catch (error) {
      decisions.push({
        target,
        action: "skip",
        reason: "scheduler error",
        dispatched: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log(JSON.stringify({ ok: true, scheduler: "forkcast-live-loop", decisions }));
  return Response.json({ ok: true, decisions });
};

export const config: Config = {
  schedule: "17 2,14 * * *"
};
