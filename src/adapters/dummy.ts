import { newRecord, upsertArtifact, writeArtifactText, writeCatalog, writeRecord } from "../domain/record.js";
import type { RecordManifest } from "../domain/types.js";
import { nowIso } from "../lib/fs.js";

export const ingestDummy = async (repoRoot: string, generatedAt = nowIso()): Promise<RecordManifest[]> => {
  if (process.env.ENABLE_DUMMY_PIPELINE !== "true") {
    throw new Error("Refusing dummy ingest unless ENABLE_DUMMY_PIPELINE=true");
  }
  const records: RecordManifest[] = [];
  let call = newRecord({
    id: "dummy-acde/2099.01.01-1",
    kind: "call",
    title: "Forkcast Dummy ACDE #1",
    generatedAt,
    dummy: true,
    sources: [{ type: "dummy", ref: "ENABLE_DUMMY_PIPELINE=true" }],
    metadata: { series: "dummy-acde", number: 1, date: "2099-01-01" }
  });
  call = upsertArtifact(call, await writeArtifactText({
    repoRoot,
    record: call,
    layer: "raw",
    role: "transcript",
    fileName: "transcript.vtt",
    body: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\nForkcast dummy call: Glamsterdam dummy snapshot, BAL decision, EIP-7702 impact.\n",
    source: "dummy",
    generatedAt
  }));
  call = upsertArtifact(call, await writeArtifactText({
    repoRoot,
    record: call,
    layer: "derived",
    role: "tldr",
    fileName: "tldr.json",
    body: `${JSON.stringify({
      fakeData: true,
      meeting: "Forkcast Dummy ACDE #1",
      highlights: {
        eip_proposals: [
          { timestamp: "00:00:04", highlight: "Dummy EIPs moved to SFI: EIP-7928 and EIP-7702" }
        ]
      },
      decisions: [{ timestamp: "00:00:05", decision: "Dummy BAL decision accepted for fixture verification" }],
      action_items: [{ timestamp: "00:00:08", action: "Trigger Astro rebuild from dummy snapshot", owner: "fixture" }]
    }, null, 2)}\n`,
    source: "dummy",
    generatedAt,
    from: ["raw/transcript.vtt"]
  }));
  await writeRecord(repoRoot, call);
  records.push(call);

  for (const eip of [
    { id: 7702, title: "EIP-7702: Set Code for EOAs", summary: "Dummy impact model covers wallet delegation, smart account UX, and tooling updates." },
    { id: 7928, title: "EIP-7928: Block-Level Access Lists", summary: "Dummy Glamsterdam BAL record used by search, SFI decisions, and devnet fixture evals." }
  ]) {
    let record = newRecord({
      id: `eip-${eip.id}`,
      kind: "proposal",
      title: eip.title,
      generatedAt,
      dummy: true,
      sources: [{ type: "dummy", ref: `eip-${eip.id}` }],
      metadata: { eip: eip.id }
    });
    record = upsertArtifact(record, await writeArtifactText({
      repoRoot,
      record,
      layer: "normalized",
      role: "proposal",
      fileName: `${eip.id}.json`,
      body: `${JSON.stringify({ id: eip.id, title: eip.title, status: "Fixture", summary: eip.summary }, null, 2)}\n`,
      source: "dummy",
      generatedAt
    }));
    await writeRecord(repoRoot, record);
    records.push(record);
  }

  let upgrade = newRecord({
    id: "glamsterdam",
    kind: "upgrade",
    title: "Glamsterdam Upgrade",
    generatedAt,
    dummy: true,
    sources: [{ type: "dummy", ref: "glamsterdam" }],
    metadata: { status: "Upcoming" }
  });
  upgrade = upsertArtifact(upgrade, await writeArtifactText({
    repoRoot,
    record: upgrade,
    layer: "normalized",
    role: "upgrade",
    fileName: "glamsterdam.json",
    body: `${JSON.stringify({
      id: "glamsterdam",
      name: "Glamsterdam Upgrade",
      status: "Upcoming",
      summary: "Dummy fixture upgrade with BAL and ePBS signals."
    }, null, 2)}\n`,
    source: "dummy",
    generatedAt
  }));
  await writeRecord(repoRoot, upgrade);
  records.push(upgrade);

  let devnet = newRecord({
    id: "bal-devnet-dummy",
    kind: "devnet",
    title: "BAL Dummy Devnet",
    generatedAt,
    dummy: true,
    sources: [{ type: "dummy", ref: "bal-devnet-dummy" }]
  });
  devnet = upsertArtifact(devnet, await writeArtifactText({
    repoRoot,
    record: devnet,
    layer: "normalized",
    role: "devnet",
    fileName: "bal-devnet-dummy.json",
    body: `${JSON.stringify({ id: "bal-devnet-dummy", upgrade: "glamsterdam", eips: [7928], status: "green" }, null, 2)}\n`,
    source: "dummy",
    generatedAt
  }));
  await writeRecord(repoRoot, devnet);
  records.push(devnet);

  await writeCatalog(repoRoot, generatedAt);
  return records;
};
