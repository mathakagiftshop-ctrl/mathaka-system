import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, newToken, verifyPassword } from "@/lib/password";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
  });

  it("session tokens are random and stored hashed", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});
