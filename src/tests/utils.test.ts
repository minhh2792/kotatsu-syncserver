import { describe, test, expect } from "bun:test";
import { sha256Hex, md5Hex, generateSecureToken } from "../utils/secure";
import { truncated } from "../utils/string";
import { isArgon2Hash } from "../utils/password";

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
});
