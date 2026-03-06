import { randomBytes, createHash } from "crypto";

export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

export function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf-8").digest("hex");
}
