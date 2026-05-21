import { describe, expect, it } from "vitest";
import { isAuthorized, sha256Hex } from "../netlify/functions/_shared/admin-auth.js";

describe("admin auth", () => {
  it("does not authorize without configured secrets", async () => {
    (globalThis as unknown as { Netlify: unknown }).Netlify = { env: { get: () => undefined } };
    expect(await isAuthorized(new Request("https://example.com/api/admin"))).toBe(false);
  });

  it("authorizes password hash without exposing the secret", async () => {
    const hash = sha256Hex("correct horse");
    (globalThis as unknown as { Netlify: unknown }).Netlify = {
      env: {
        get: (key: string) => key === "ADMIN_PASSWORD_HASH" ? hash : undefined
      }
    };
    const request = new Request("https://example.com/api/admin", {
      headers: { "x-admin-password": "correct horse" }
    });
    expect(await isAuthorized(request)).toBe(true);
  });
});
