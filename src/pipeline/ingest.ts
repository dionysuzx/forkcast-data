import { readAllRecords } from "../domain/record.js";
import type { RecordManifest } from "../domain/types.js";
import { ingestDiscordArchive } from "../adapters/discordArchive.js";
import { ingestDiscourseLinks } from "../adapters/discourse.js";
import { ingestDummy } from "../adapters/dummy.js";
import { ingestEips } from "../adapters/eips.js";
import { ingestForkcast } from "../adapters/forkcast.js";
import { ingestGithubPmIssues } from "../adapters/githubPmIssues.js";
import { ingestPmLean } from "../adapters/pmLean.js";
import { nowIso } from "../lib/fs.js";

export interface IngestOptions {
  repoRoot: string;
  source: string;
  dummy: boolean;
  limit: number;
  pmLeanOut: string;
  forkcastRoot: string;
  eipsRoot: string;
  ethRndArchiveRoot: string;
  generatedAt?: string;
}

export const ingest = async (options: IngestOptions): Promise<RecordManifest[]> => {
  const generatedAt = options.generatedAt ?? nowIso();
  if (options.dummy) return ingestDummy(options.repoRoot, generatedAt);
  const records: RecordManifest[] = [];
  const source = options.source;
  const isCanonical = source === "canonical" || source === "live";
  if (isCanonical) {
    records.push(...await ingestEips(options.repoRoot, options.eipsRoot, options.forkcastRoot, generatedAt));
    records.push(...await ingestForkcast(options.repoRoot, options.forkcastRoot, generatedAt));
    records.push(...await ingestPmLean(options.repoRoot, options.pmLeanOut, generatedAt));
    records.push(...await ingestGithubPmIssues(options.repoRoot, options.limit, generatedAt));
    records.push(...await ingestDiscordArchive(options.repoRoot, options.ethRndArchiveRoot, options.limit, generatedAt));
  }
  if (source === "all" || source === "eips") records.push(...await ingestEips(options.repoRoot, options.eipsRoot, options.forkcastRoot, generatedAt));
  if (source === "all" || source === "forkcast") records.push(...await ingestForkcast(options.repoRoot, options.forkcastRoot, generatedAt));
  if (source === "all" || source === "pm-lean") records.push(...await ingestPmLean(options.repoRoot, options.pmLeanOut, generatedAt));
  if (source === "all" || source === "github-pm-issues" || source === "fixture") records.push(...await ingestGithubPmIssues(options.repoRoot, options.limit, generatedAt));
  if (source === "all" || source === "discord-archive") records.push(...await ingestDiscordArchive(options.repoRoot, options.ethRndArchiveRoot, options.limit, generatedAt));
  const discourseLinks = (await readAllRecords(options.repoRoot))
    .flatMap((record) => {
      const metadata = record.metadata ?? {};
      return Array.isArray(metadata.discourseLinks) ? metadata.discourseLinks.filter((link): link is string => typeof link === "string") : [];
    });
  if (source === "all" || isCanonical || source === "discourse" || source === "github-pm-issues" || source === "fixture") {
    records.push(...await ingestDiscourseLinks(options.repoRoot, discourseLinks, generatedAt));
  }
  return records;
};
