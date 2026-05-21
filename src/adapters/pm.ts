import { join } from "node:path";
import type { RecordManifest } from "../domain/types.js";
import { copyArtifactFile, newRecord, upsertArtifact, writeCatalog, writeRecord } from "../domain/record.js";
import { nowIso, pathExists, readJson } from "../lib/fs.js";

interface PmArtifactManifest {
  series: Record<string, {
    name: string;
    calls: Array<{
      date: string;
      path: string;
      resources: Record<string, string>;
      number?: number;
      issue?: number;
      videoUrl?: string;
    }>;
  }>;
}

const roleForResource = (resource: string): { layer: "raw" | "normalized" | "derived"; role: string } => {
  if (resource === "transcript") return { layer: "raw", role: "transcript" };
  if (resource === "chat") return { layer: "raw", role: "chat" };
  if (resource === "transcript_corrected") return { layer: "normalized", role: "transcript-corrected" };
  if (resource === "changelog") return { layer: "normalized", role: "transcript-changelog" };
  return { layer: "derived", role: resource };
};

const displayDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
};

export const ingestPmArtifacts = async (repoRoot: string, pmRoot: string, limit = 16, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  const manifestPath = join(pmRoot, ".github", "ACDbot", "artifacts", "manifest.json");
  if (!(await pathExists(manifestPath))) return [];
  const manifest = await readJson<PmArtifactManifest>(manifestPath);
  const records: RecordManifest[] = [];
  for (const [seriesSlug, series] of Object.entries(manifest.series)) {
    const calls = limit > 0 ? series.calls.slice(0, limit) : series.calls;
    for (const call of calls) {
      if (call.number === undefined) continue;
      const canonicalDate = call.date.replaceAll("-", ".");
      let record = newRecord({
        id: `${seriesSlug}/${canonicalDate}-${call.number}`,
        kind: "call",
        title: `${series.name} #${call.number}, ${displayDate(call.date)}`,
        generatedAt,
        sources: [
          { type: "pm", ref: call.path, url: `https://github.com/ethereum/pm/tree/master/.github/ACDbot/artifacts/${call.path}` }
        ],
        metadata: { series: seriesSlug, date: call.date, number: call.number, issue: call.issue, videoUrl: call.videoUrl }
      });
      if (call.issue) record.sources.push({ type: "github-pm-issues", ref: `ethereum/pm#${call.issue}`, url: `https://github.com/ethereum/pm/issues/${call.issue}` });
      for (const [resource, fileName] of Object.entries(call.resources)) {
        const { layer, role } = roleForResource(resource);
        record = upsertArtifact(record, await copyArtifactFile({
          repoRoot,
          record,
          sourceFile: join(pmRoot, ".github", "ACDbot", "artifacts", call.path, fileName),
          layer,
          role,
          targetFileName: fileName,
          source: "pm",
          sourceUrl: `https://github.com/ethereum/pm/tree/master/.github/ACDbot/artifacts/${call.path}/${fileName}`,
          generatedAt
        }));
      }
      await writeRecord(repoRoot, record);
      records.push(record);
    }
  }
  await writeCatalog(repoRoot, generatedAt);
  return records;
};
