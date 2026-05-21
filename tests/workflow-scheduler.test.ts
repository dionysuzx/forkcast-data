import { describe, expect, it } from "vitest";
import { hasActiveRun, shouldDispatch, type WorkflowRun, type WorkflowTarget } from "../netlify/functions/_shared/workflow-scheduler.js";

const target: WorkflowTarget = {
  repo: "forkcast-data",
  workflow: "data-pipeline.yml",
  staleAfterMinutes: 18,
  inputs: { source: "canonical" }
};

describe("workflow scheduler", () => {
  it("does not dispatch when a workflow is already active", () => {
    const runs: WorkflowRun[] = [{ id: 1, status: "in_progress", created_at: "2099-01-01T00:00:00Z" }];
    expect(hasActiveRun(runs)).toBe(true);
    expect(shouldDispatch(target, runs, new Date("2099-01-01T01:00:00Z"))).toMatchObject({
      action: "skip",
      reason: "workflow already queued or running",
      latestRunId: 1
    });
  });

  it("dispatches when the latest completed run is stale", () => {
    const runs: WorkflowRun[] = [{ id: 2, status: "completed", created_at: "2099-01-01T00:00:00Z" }];
    expect(shouldDispatch(target, runs, new Date("2099-01-01T00:20:00Z"))).toMatchObject({
      action: "dispatch",
      latestRunId: 2
    });
  });

  it("skips when the latest completed run is still fresh", () => {
    const runs: WorkflowRun[] = [{ id: 3, status: "completed", created_at: "2099-01-01T00:10:00Z" }];
    expect(shouldDispatch(target, runs, new Date("2099-01-01T00:20:00Z"))).toMatchObject({
      action: "skip",
      latestRunId: 3
    });
  });
});
