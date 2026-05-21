export interface WorkflowRun {
  id: number;
  status: "queued" | "in_progress" | "completed" | string;
  created_at: string;
}

export interface WorkflowTarget {
  repo: string;
  workflow: string;
  staleAfterMinutes: number;
  inputs: Record<string, string | boolean>;
}

export interface SchedulerDecision {
  target: WorkflowTarget;
  action: "dispatch" | "skip";
  reason: string;
  latestRunId?: number;
}

export const hasActiveRun = (runs: WorkflowRun[]): boolean =>
  runs.some((run) => run.status === "queued" || run.status === "in_progress");

export const latestRun = (runs: WorkflowRun[]): WorkflowRun | undefined =>
  [...runs].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

export const shouldDispatch = (
  target: WorkflowTarget,
  runs: WorkflowRun[],
  now: Date
): SchedulerDecision => {
  const latest = latestRun(runs);
  if (hasActiveRun(runs)) {
    return {
      target,
      action: "skip",
      reason: "workflow already queued or running",
      ...(latest ? { latestRunId: latest.id } : {})
    };
  }
  if (!latest) {
    return { target, action: "dispatch", reason: "no previous workflow runs" };
  }
  const ageMinutes = (now.getTime() - Date.parse(latest.created_at)) / 60000;
  if (ageMinutes < target.staleAfterMinutes) {
    return {
      target,
      action: "skip",
      reason: `latest run is ${Math.round(ageMinutes)} minutes old`,
      latestRunId: latest.id
    };
  }
  return {
    target,
    action: "dispatch",
    reason: `latest run is ${Math.round(ageMinutes)} minutes old`,
    latestRunId: latest.id
  };
};

export const schedulerTargets: WorkflowTarget[] = [
  {
    repo: "pm-lean",
    workflow: "asset-generation.yml",
    staleAfterMinutes: 25,
    inputs: {
      source: "fixture-live",
      limit: "25",
      enable_dummy_pipeline: false,
      dispatch_forkcast_data: true
    }
  },
  {
    repo: "forkcast-data",
    workflow: "data-pipeline.yml",
    staleAfterMinutes: 18,
    inputs: {
      source: "canonical",
      source_limit: "0",
      dummy_mode: false,
      force_rebuild: false,
      eval_bypass_reason: ""
    }
  },
  {
    repo: "forkcast-astro",
    workflow: "snapshot-rebuild.yml",
    staleAfterMinutes: 28,
    inputs: {
      target_snapshot: "",
      force_rebuild: false,
      deploy_target: "prod"
    }
  }
];
