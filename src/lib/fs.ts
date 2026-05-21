import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export const nowIso = (): string => new Date().toISOString();

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

export const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

export const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

export const writeText = async (path: string, value: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};

export const sha256 = (body: Buffer | string): string =>
  createHash("sha256").update(body).digest("hex");

export const sha256File = async (path: string): Promise<string> =>
  sha256(await readFile(path));

export const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      const info = await stat(path);
      if (info.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk(root);
  return files.sort();
};

export const copyFileInto = async (source: string, target: string): Promise<void> => {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { force: true });
};

export const unixRelative = (from: string, to: string): string =>
  relative(from, to).split("\\").join("/");

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

export const stableJson = (value: unknown): string => `${JSON.stringify(value, Object.keys(value as object).sort(), 2)}\n`;
