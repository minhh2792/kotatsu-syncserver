import { describe, test, expect, spyOn } from "bun:test";
import { sha256Hex, md5Hex, generateSecureToken } from "../utils/secure";
import { truncated } from "../utils/string";
import { isArgon2Hash, hashPassword, verifyArgon2Password } from "../utils/password";
import { RateLimiter } from "../utils/rateLimiter";
import { logger } from "../utils/logger";

describe("sha256Hex", () => {
  test("produces correct hash for known input", () => {
    // SHA-256 of empty string
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  test("produces 64-char hex string", () => {
    const hash = sha256Hex("hello world");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  test("same input always produces same hash", () => {
    expect(sha256Hex("kotatsu")).toBe(sha256Hex("kotatsu"));
  });

  test("different inputs produce different hashes", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});

describe("md5Hex", () => {
  test("produces correct hash for known input", () => {
    // MD5 of "password" is 5f4dcc3b5aa765d61d8327deb882cf99
    expect(md5Hex("password")).toBe("5f4dcc3b5aa765d61d8327deb882cf99");
  });

  test("produces 32-char hex string", () => {
    const hash = md5Hex("test");
    expect(hash).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  test("same input always produces same hash", () => {
    expect(md5Hex("kotatsu")).toBe(md5Hex("kotatsu"));
  });
});

describe("generateSecureToken", () => {
  test("produces different tokens each time", () => {
    const t1 = generateSecureToken();
    const t2 = generateSecureToken();
    expect(t1).not.toBe(t2);
  });

  test("default token has reasonable length", () => {
    const token = generateSecureToken();
    expect(token.length).toBeGreaterThan(20);
  });

  test("custom length produces longer token", () => {
    const short = generateSecureToken(16);
    const long = generateSecureToken(64);
    expect(long.length).toBeGreaterThan(short.length);
  });
});

describe("truncated", () => {
  test("truncates string exceeding max length", () => {
    expect(truncated("hello world", 5)).toBe("hello");
  });

  test("returns string unchanged if within limit", () => {
    expect(truncated("hi", 5)).toBe("hi");
  });

  test("returns string unchanged if exactly at limit", () => {
    expect(truncated("hello", 5)).toBe("hello");
  });

  test("truncates to zero length", () => {
    expect(truncated("hello", 0)).toBe("");
  });

  test("handles empty string", () => {
    expect(truncated("", 5)).toBe("");
  });
});

describe("isArgon2Hash", () => {
  test("returns true for argon2id hash", () => {
    const fakeHash = "$argon2id$v=19$m=65536,t=3,p=4$fakesalt$fakehash";
    expect(isArgon2Hash(fakeHash)).toBe(true);
  });

  test("returns false for MD5 hash", () => {
    expect(isArgon2Hash("5f4dcc3b5aa765d61d8327deb882cf99")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isArgon2Hash("")).toBe(false);
  });

  test("returns false for argon2i (not argon2id)", () => {
    expect(isArgon2Hash("$argon2i$v=19$m=65536,t=3,p=4$fakesalt$fakehash")).toBe(false);
  });
});

describe("hashPassword / verifyArgon2Password", () => {
  test("hash produces an argon2id hash string", async () => {
    const hash = await hashPassword("secret");
    expect(isArgon2Hash(hash)).toBe(true);
  });

  test("verify returns true for correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyArgon2Password("correct-horse-battery-staple", hash)).toBe(true);
  });

  test("verify returns false for wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyArgon2Password("wrong-password", hash)).toBe(false);
  });

  test("same password hashed twice produces different hashes (salting)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("RateLimiter", () => {
  test("allows requests within limit", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("key1")).toBe(true);
    expect(limiter.check("key1")).toBe(true);
    expect(limiter.check("key1")).toBe(true);
  });

  test("blocks request exceeding limit", () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("key2");
    limiter.check("key2");
    expect(limiter.check("key2")).toBe(false);
  });

  test("different keys are tracked independently", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("b")).toBe(true);
    // "a" is now exhausted, "b" still has its own window
    expect(limiter.check("a")).toBe(false);
    expect(limiter.check("b")).toBe(false);
  });

  test("resets after window expires", async () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 50 });
    limiter.check("key3");
    expect(limiter.check("key3")).toBe(false);
    // Wait well past the window to avoid timing flakiness
    await new Promise((r) => setTimeout(r, 100));
    expect(limiter.check("key3")).toBe(true);
  });
});

describe("logger", () => {
  test("logger.info calls console.log", () => {
    const spy = spyOn(console, "log");
    logger.info("TestSvc", "testOp", "some detail");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("logger.warn calls console.warn", () => {
    const spy = spyOn(console, "warn");
    logger.warn("TestSvc", "testWarn");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("logger.error calls console.error", () => {
    const spy = spyOn(console, "error");
    logger.error("TestSvc", "testError", "oops");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("logger.success calls console.log", () => {
    const spy = spyOn(console, "log");
    logger.success("TestSvc", "testSuccess");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("log output contains service name and operation", () => {
    const calls: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      calls.push(args.join(" "));
    });
    logger.info("MyService", "myOperation", "detail");
    spy.mockRestore();
    expect(calls[0]).toContain("MyService");
    expect(calls[0]).toContain("myOperation");
    expect(calls[0]).toContain("detail");
  });
});
