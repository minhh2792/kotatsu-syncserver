import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "../db/index";
import type { User, UserInfo, AuthRequest } from "../models/user";
import { hashPassword, verifyArgon2Password, isArgon2Hash } from "../utils/password";
import { md5Hex } from "../utils/secure";
import { generateSecureToken, sha256Hex } from "../utils/secure";

export function toUserInfo(user: User): UserInfo {
  return { id: user.id, email: user.email, nickname: user.nickname };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, email, password_hash, password_reset_token_hash,
            password_reset_token_expires_at, nickname,
            favourites_sync_timestamp, history_sync_timestamp
     FROM users WHERE email = ?`,
    [email]
  );
  if (rows.length === 0) return null;
  return mapUser(rows[0]);
}

export async function findUserById(id: number): Promise<User | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, email, password_hash, password_reset_token_hash,
            password_reset_token_expires_at, nickname,
            favourites_sync_timestamp, history_sync_timestamp
     FROM users WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  return mapUser(rows[0]);
}

function mapUser(row: RowDataPacket): User {
  return {
    id: Number(row.id),
    email: row.email as string,
    passwordHash: row.password_hash as string,
    passwordResetTokenHash: (row.password_reset_token_hash as string | null) ?? null,
    passwordResetTokenExpiresAt:
      row.password_reset_token_expires_at != null
        ? Number(row.password_reset_token_expires_at)
        : null,
    nickname: (row.nickname as string | null) ?? null,
    favouritesSyncTimestamp:
      row.favourites_sync_timestamp != null
        ? Number(row.favourites_sync_timestamp)
        : null,
    historySyncTimestamp:
      row.history_sync_timestamp != null
        ? Number(row.history_sync_timestamp)
        : null,
  };
}

export async function getOrCreateUser(
  request: AuthRequest,
  allowNewRegister: boolean
): Promise<UserInfo | null> {
  if (request.password.length < 2 || request.password.length > 24) {
    throw new Error("Password should be from 2 to 24 characters long");
  }
  if (request.email.length < 5 || request.email.length > 320 || !request.email.includes("@")) {
    throw new Error("Invalid email address");
  }

  const user = await findUserByEmail(request.email);

  if (user === null) {
    if (!allowNewRegister) return null;
    const hash = await hashPassword(request.password);
    return registerUser(request, hash);
  }

  const storedHash = user.passwordHash;
  if (isArgon2Hash(storedHash)) {
    const verified = await verifyArgon2Password(request.password, storedHash);
    return verified ? toUserInfo(user) : null;
  }

  // MD5 legacy fallback
  if (storedHash === md5Hex(request.password)) {
    // Upgrade to argon2id
    const newHash = await hashPassword(request.password);
    await getPool().execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [newHash, user.id]
    );
    return toUserInfo(user);
  }

  return null;
}

async function registerUser(request: AuthRequest, passwordHash: string): Promise<UserInfo | null> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO users (email, password_hash, nickname, favourites_sync_timestamp, history_sync_timestamp) VALUES (?, ?, NULL, NULL, NULL)",
    [request.email, passwordHash]
  );
  const userId = result.insertId;
  return findUserById(userId).then((u) => (u ? toUserInfo(u) : null));
}

export async function setPasswordResetToken(userId: number): Promise<string> {
  const pool = getPool();
  const token = generateSecureToken();
  const tokenHash = sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 900; // 15 minutes

  await pool.execute(
    "UPDATE users SET password_reset_token_hash = ?, password_reset_token_expires_at = ? WHERE id = ?",
    [tokenHash, expiresAt, userId]
  );

  return token;
}

export async function findUserByValidPasswordResetToken(token: string): Promise<User | null> {
  const pool = getPool();
  const tokenHash = sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, email, password_hash, password_reset_token_hash,
            password_reset_token_expires_at, nickname,
            favourites_sync_timestamp, history_sync_timestamp
     FROM users
     WHERE password_reset_token_hash = ? AND password_reset_token_expires_at >= ?`,
    [tokenHash, now]
  );
  if (rows.length === 0) return null;
  return mapUser(rows[0]);
}

export async function resetPassword(userId: number, newPasswordHash: string): Promise<void> {
  await getPool().execute(
    "UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_token_expires_at = NULL WHERE id = ?",
    [newPasswordHash, userId]
  );
}

export async function setFavouritesSynchronized(userId: number, timestamp: number): Promise<void> {
  await getPool().execute(
    "UPDATE users SET favourites_sync_timestamp = ? WHERE id = ?",
    [timestamp, userId]
  );
}

export async function setHistorySynchronized(userId: number, timestamp: number): Promise<void> {
  await getPool().execute(
    "UPDATE users SET history_sync_timestamp = ? WHERE id = ?",
    [timestamp, userId]
  );
}
