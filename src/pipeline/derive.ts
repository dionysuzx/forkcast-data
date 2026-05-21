import { join } from "node:path";
import { readAllRecords, readArtifactText, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import type { DecisionReadModel, RecordManifest } from "../domain/types.js";
import { nowIso, sha256 } from "../lib/fs.js";

const compact = (value: string): string => value.replace(/\s+/g, " ").trim();

const parseJsonArtifact = async <T>(repoRoot: string, record: RecordManifest, role: string): Promise<T | null> => {
  const artifact = record.artifacts.find((entry) => entry.role === role);
  if (!artifact) return null;
  try {
    return JSON.parse(await readArtifactText(repoRoot, record, artifact)) as T;
  } catch {
    return null;
  }
};

interface CallIntelligence {
  schemaVersion: 1;
  recordId: string;
  title: string;
  summary: string;
  decisions: DecisionReadModel[];
  agendaHash: string | null;
  provenance: {
    generatedAt: string;
    generator: string;
    inputArtifacts: Array<{ path: string; sha256: string }>;
  };
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const derive = async (repoRoot: string, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const records = await readAllRecords(repoRoot);
  const changed: RecordManifest[] = [];
  for (let record of records) {
    if (record.kind === "call") {
      const tldr = await parseJsonArtifact<{ decisions?: Array<{ decision?: string; timestamp?: string }>; action_items?: unknown[] }>(repoRoot, record, "tldr");
      const agenda = await parseJsonArtifact<{ agendaMarkdown?: string }>(repoRoot, record, "agenda");
      const transcriptArtifact = record.artifacts.find((entry) => entry.role.includes("transcript"));
      const transcript = transcriptArtifact ? await readArtifactText(repoRoot, record, transcriptArtifact) : "";
      const summary = compact(
        tldr ? JSON.stringify(tldr).slice(0, 1000) :
        agenda?.agendaMarkdown ?? transcript.slice(0, 1000) ?? record.title
      ).slice(0, 420);
      const decisions: DecisionReadModel[] = (tldr?.decisions ?? []).map((decision, index) => ({
        id: `${record.id}#decision-${index + 1}`,
        record_id: record.id,
        title: decision.decision ?? "Decision",
        decided_at: decision.timestamp,
        canonical_url: `/latest/decisions/index.ndjson`,
        citations: [{
          recordId: record.id,
          artifactPath: "derived/call-intelligence.json",
          url: `/records/call/${record.id}/derived/call-intelligence.json`,
          label: record.title,
          snippet: decision.decision
        }]
      }));
      const outputPath = "derived/call-intelligence.json";
      const inputArtifacts = record.artifacts
        .filter((artifact) => artifact.path !== outputPath)
        .map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
      const agendaHash = agenda?.agendaMarkdown ? sha256(agenda.agendaMarkdown) : null;
      const previous = await parseJsonArtifact<CallIntelligence>(repoRoot, record, "call-intelligence");
      const stableGeneratedAt = previous &&
        previous.title === record.title &&
        previous.summary === summary &&
        sameJson(previous.decisions, decisions) &&
        previous.agendaHash === agendaHash &&
        sameJson(previous.provenance.inputArtifacts, inputArtifacts)
        ? previous.provenance.generatedAt
        : generatedAt;
      record = upsertArtifact(record, await writeArtifactText({
        repoRoot,
        record,
        layer: "derived",
        role: "call-intelligence",
        fileName: "call-intelligence.json",
        body: `${JSON.stringify({
          schemaVersion: 1,
          recordId: record.id,
          title: record.title,
          summary,
          decisions,
          agendaHash,
          provenance: {
            generatedAt: stableGeneratedAt,
            generator: "forkcast-data/derive-call-intelligence",
            inputArtifacts
          }
        }, null, 2)}\n`,
        source: "forkcast-data",
        generatedAt,
        from: inputArtifacts.map((artifact) => artifact.path)
      }));
      await writeRecord(repoRoot, record);
      changed.push(record);
    }

    if (record.kind === "proposal") {
      const proposal = await parseJsonArtifact<{ id?: number; title?: string; description?: string; laymanDescription?: string; stakeholderImpacts?: Record<string, { description?: string }> }>(repoRoot, record, "proposal");
      if (proposal) {
        const impacts = Object.values(proposal.stakeholderImpacts ?? {}).map((impact) => impact.description).filter((value): value is string => Boolean(value));
        record = upsertArtifact(record, await writeArtifactText({
          repoRoot,
          record,
          layer: "derived",
          role: "proposal-brief",
          fileName: "brief.json",
          body: `${JSON.stringify({
            id: proposal.id,
            title: proposal.title ?? record.title,
            summary: proposal.laymanDescription ?? proposal.description ?? record.title,
            impacts
          }, null, 2)}\n`,
          source: "forkcast-data",
          generatedAt,
          from: record.artifacts.filter((artifact) => artifact.path !== "derived/brief.json").map((artifact) => artifact.path)
        }));
        await writeRecord(repoRoot, record);
        changed.push(record);
      }
    }
  }
  await writeCatalog(repoRoot, generatedAt);
  return changed;
};

export const readDerivedCall = async (repoRoot: string, record: RecordManifest): Promise<{ summary: string; decisions: DecisionReadModel[] } | null> => {
  const artifact = record.artifacts.find((entry) => entry.role === "call-intelligence");
  if (!artifact) return null;
  const parsed = JSON.parse(await readArtifactText(repoRoot, record, artifact)) as { summary: string; decisions: DecisionReadModel[] };
  return parsed;
};

export const latestDataRoot = (repoRoot: string): string => join(repoRoot, "dist", "latest");
