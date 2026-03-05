import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/index";
import type { History, HistoryPackage } from "../models/history";
import { getMangaById, upsertManga } from "./mangaService";

export async function syncHistory(
  userId: number,
  historySyncTimestamp: number | null,
  request: HistoryPackage | null
): Promise<HistoryPackage> {
  if (request !== null) {
    for (const history of request.history) {
      await upsertManga(history.manga);
      await upsertHistory(history, userId);
    }
  }

  const items = await getHistoryForUser(userId);
  return {
    history: items,
    timestamp: historySyncTimestamp ?? 0,
  };
}

async function getHistoryForUser(userId: number): Promise<History[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT manga_id, created_at, updated_at, chapter_id, page, scroll, percent, chapters, deleted_at
     FROM history WHERE user_id = ?`,
    [userId]
  );

  const result: History[] = [];
  for (const row of rows) {
    const manga = await getMangaById(Number(row.manga_id));
    if (!manga) continue;
    result.push({
      manga_id: Number(row.manga_id),
      manga,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      chapter_id: Number(row.chapter_id),
      page: Number(row.page),
      scroll: Number(row.scroll),
      percent: Number(row.percent),
      chapters: Number(row.chapters),
      deleted_at: Number(row.deleted_at),
    });
  }
  return result;
}

async function upsertHistory(history: History, userId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO history (manga_id, created_at, updated_at, chapter_id, page, scroll, percent, chapters, deleted_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       created_at = VALUES(created_at), updated_at = VALUES(updated_at),
       chapter_id = VALUES(chapter_id), page = VALUES(page),
       scroll = VALUES(scroll), percent = VALUES(percent),
       chapters = VALUES(chapters), deleted_at = VALUES(deleted_at)`,
    [
      history.manga_id,
      history.created_at,
      history.updated_at,
      history.chapter_id,
      history.page,
      history.scroll,
      history.percent,
      history.chapters,
      history.deleted_at,
      userId,
    ]
  );
}
