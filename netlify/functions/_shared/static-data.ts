import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const siteRoot = (): string => join(process.cwd(), "dist");

export const latestDataRoot = async (): Promise<string> => {
  const direct = join(siteRoot(), "latest");
  const directInfo = await stat(direct).catch(() => null);
  if (directInfo?.isDirectory()) return direct;

  const snapshotsIndex = JSON.parse(await readFile(join(siteRoot(), "snapshots", "index.json"), "utf8")) as { latest?: string };
  if (!snapshotsIndex.latest) throw new Error("Missing latest snapshot pointer");
  return join(siteRoot(), "snapshots", snapshotsIndex.latest);
};

export const readLatestJson = async <T>(path: string, fallback?: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(join(await latestDataRoot(), path), "utf8")) as T;
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
};
