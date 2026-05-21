export type RecordKind = "call" | "topic" | "thread" | "upgrade" | "proposal" | "devnet";
export type ArtifactLayer = "raw" | "normalized" | "derived";

export interface Provenance {
  source: string;
  sourcePath?: string | undefined;
  sourceUrl?: string | undefined;
  sourceHash?: string | undefined;
  commit?: string | undefined;
  generatedAt: string;
  generator: string;
  generatorVersion: string;
  provider?: "fixture" | "openai" | "anthropic" | "deepseek" | undefined;
  model?: string | undefined;
  promptHash?: string | undefined;
  inputHashes?: string[] | undefined;
  citationSpans?: Array<{
    artifactPath: string;
    start?: number | undefined;
    end?: number | undefined;
    text?: string | undefined;
  }> | undefined;
  cost?: {
    provider?: string | undefined;
    model?: string | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    estimatedUsd?: number | undefined;
  } | undefined;
}

export interface Artifact {
  layer: ArtifactLayer;
  role: string;
  path: string;
  sha256: string;
  bytes: number;
  updatedAt: string;
  source?: string | undefined;
  producedBy?: string | undefined;
  from?: string[] | undefined;
  provenance: Provenance;
}

export interface SourceRef {
  type:
    | "forkcast"
    | "eips"
    | "pm"
    | "pm-lean"
    | "fixture-live"
    | "github-pm-issues"
    | "discourse"
    | "discord-archive"
    | "discord-direct"
    | "dummy";
  ref: string;
  url?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecordManifest {
  id: string;
  kind: RecordKind;
  title: string;
  updatedAt: string;
  dummy: boolean;
  sources: SourceRef[];
  artifacts: Artifact[];
  metadata?: Record<string, unknown> | undefined;
}

export interface CatalogEntry {
  id: string;
  kind: RecordKind;
  title: string;
  manifest_path: string;
  updated_at: string;
  dummy: boolean;
}

export interface Catalog {
  version: 1;
  generated_at: string;
  records: CatalogEntry[];
}

export interface SnapshotManifest {
  version: 1;
  snapshot_id: string;
  generated_at: string;
  catalog_path: string;
  record_count: number;
  read_models: string[];
  provenance_complete: boolean;
  dummy: boolean;
}

export interface Citation {
  recordId: string;
  artifactPath: string;
  url: string;
  label: string;
  snippet?: string | undefined;
}

export interface EipReadModel {
  id: number;
  title: string;
  status: string;
  type?: string | undefined;
  category?: string | undefined;
  summary: string;
  impacts: string[];
  discussion_url?: string | undefined;
  source_markdown_url?: string | undefined;
  canonical_url: string;
  markdown_url: string;
  citations: Citation[];
}

export interface CallReadModel {
  id: string;
  series: string;
  number: number;
  date: string;
  title: string;
  summary: string;
  decisions: DecisionReadModel[];
  canonical_json_url: string;
  canonical_markdown_url: string;
  citations: Citation[];
}

export interface DecisionReadModel {
  id: string;
  record_id: string;
  title: string;
  decided_at?: string | undefined;
  subject?: string | undefined;
  canonical_url: string;
  citations: Citation[];
}

export interface SearchDocument {
  id: string;
  kind: RecordKind | "decision" | "eip";
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  tags: string[];
}
