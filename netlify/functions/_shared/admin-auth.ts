import { createHash, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const isAuthorized = async (request: Request): Promise<boolean> => {
  const token = Netlify.env.get("ADMIN_TOKEN");
  const passwordHash = Netlify.env.get("ADMIN_PASSWORD_HASH");
  const header = request.headers.get("authorization") ?? "";
  if (token && header === `Bearer ${token}`) return true;
  if (!passwordHash) return false;
  const password = request.headers.get("x-admin-password");
  if (!password) return false;
  const candidate = Buffer.from(sha256Hex(password));
  const expected = Buffer.from(passwordHash);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const adminSecretStatus = () => ({
  hasAdminToken: Boolean(Netlify.env.get("ADMIN_TOKEN")),
  hasAdminPasswordHash: Boolean(Netlify.env.get("ADMIN_PASSWORD_HASH")),
  requiredForActions: ["ADMIN_TOKEN or ADMIN_PASSWORD_HASH", "GITHUB_TOKEN", "NETLIFY_AUTH_TOKEN"]
});
