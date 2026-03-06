/**
 * Hash a password using argon2id (Bun built-in).
 * Parameters match original: iterations=3, memory=64MB, parallelism=4.
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 3,
  });
}

/**
 * Verify a password against an argon2id hash.
 */
export async function verifyArgon2Password(
  password: string,
  hash: string
): Promise<boolean> {
  return Bun.password.verify(password, hash, "argon2id");
}

export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2id$");
}
