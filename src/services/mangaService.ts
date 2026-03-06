import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/index";
import type { Manga, MangaTag } from "../models/manga";
import { truncated } from "../utils/string";
import { logger } from "../utils/logger";

const SVC = "MangaService";

const VALID_CONTENT_RATINGS = new Set(["SAFE", "SUGGESTIVE", "ADULT"]);
const VALID_STATES = new Set(["ONGOING", "FINISHED", "ABANDONED", "PAUSED", "UPCOMING", "RESTRICTED"]);

function normalizeContentRating(v: string | null | undefined): string | null {
  if (!v || !VALID_CONTENT_RATINGS.has(v)) return null;
  return v;
}

function normalizeState(v: string | null | undefined): string | null {
  if (!v || !VALID_STATES.has(v)) return null;
  return v;
}

export async function getMangaById(id: number): Promise<Manga | null> {
  logger.info(SVC, "getMangaById", `id=${id}`);
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, alt_title, url, public_url, rating, content_rating,
            cover_url, large_cover_url, state, author, source
     FROM manga WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const tagMap = await getTagsForMangaIds([Number(rows[0].id)]);
  return mapManga(rows[0], tagMap.get(Number(rows[0].id)) ?? []);
}

export async function getMangaList(offset: number, limit: number): Promise<Manga[]> {
  logger.info(SVC, "getMangaList", `offset=${offset} limit=${limit}`);
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, alt_title, url, public_url, rating, content_rating,
            cover_url, large_cover_url, state, author, source
     FROM manga LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  if (rows.length === 0) return [];

  const mangaIds = rows.map((r) => Number(r.id));
  const tagMap = await getTagsForMangaIds(mangaIds);
  return rows.map((row) => mapManga(row, tagMap.get(Number(row.id)) ?? []));
}

export async function getMangaByIds(ids: number[]): Promise<Map<number, Manga>> {
  logger.info(SVC, "getMangaByIds", `count=${ids.length}`);
  if (ids.length === 0) return new Map();
  const pool = getPool();
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, alt_title, url, public_url, rating, content_rating,
            cover_url, large_cover_url, state, author, source
     FROM manga WHERE id IN (${placeholders})`,
    ids
  );

  const mangaIds = rows.map((r) => Number(r.id));
  const tagMap = await getTagsForMangaIds(mangaIds);

  const result = new Map<number, Manga>();
  for (const row of rows) {
    const id = Number(row.id);
    result.set(id, mapManga(row, tagMap.get(id) ?? []));
  }
  return result;
}

async function getTagsForMangaIds(mangaIds: number[]): Promise<Map<number, MangaTag[]>> {
  if (mangaIds.length === 0) return new Map();
  const pool = getPool();
  const placeholders = mangaIds.map(() => "?").join(",");
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT mt.manga_id, t.id, t.title, t.key, t.source
     FROM tags t
     INNER JOIN manga_tags mt ON mt.tag_id = t.id
     WHERE mt.manga_id IN (${placeholders})`,
    mangaIds
  );

  const tagMap = new Map<number, MangaTag[]>();
  for (const row of rows) {
    const mangaId = Number(row.manga_id);
    if (!tagMap.has(mangaId)) tagMap.set(mangaId, []);
    tagMap.get(mangaId)!.push({
      tag_id: Number(row.id),
      title: row.title as string,
      key: row.key as string,
      source: row.source as string,
    });
  }
  return tagMap;
}

function mapManga(row: RowDataPacket, tags: MangaTag[]): Manga {
  return {
    manga_id: Number(row.id),
    title: row.title as string,
    alt_title: (row.alt_title as string | null) ?? null,
    url: row.url as string,
    public_url: row.public_url as string,
    rating: Number(row.rating),
    content_rating: (row.content_rating as string | null) ?? null,
    cover_url: row.cover_url as string,
    large_cover_url: (row.large_cover_url as string | null) ?? null,
    tags,
    state: (row.state as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    source: row.source as string,
  };
}

export async function upsertManga(manga: Manga): Promise<void> {
  logger.info(SVC, "upsertManga", `id=${manga.manga_id} title="${manga.title}"`);
  const pool = getPool();
  await pool.execute(
    `INSERT INTO manga (id, title, alt_title, url, public_url, rating, content_rating,
                        cover_url, large_cover_url, state, author, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), alt_title = VALUES(alt_title),
       url = VALUES(url), public_url = VALUES(public_url),
       rating = VALUES(rating), content_rating = VALUES(content_rating),
       cover_url = VALUES(cover_url), large_cover_url = VALUES(large_cover_url),
       state = VALUES(state), author = VALUES(author), source = VALUES(source)`,
    [
      manga.manga_id,
      truncated(manga.title, 100),
      manga.alt_title ? truncated(manga.alt_title, 100) : null,
      truncated(manga.url, 255),
      truncated(manga.public_url, 255),
      manga.rating,
      normalizeContentRating(manga.content_rating),
      truncated(manga.cover_url, 255),
      manga.large_cover_url ? truncated(manga.large_cover_url, 255) : null,
      normalizeState(manga.state),
      manga.author ? truncated(manga.author, 64) : null,
      truncated(manga.source, 32),
    ]
  );

  for (const tag of manga.tags) {
    await pool.execute(
      `INSERT INTO tags (id, title, \`key\`, source)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), \`key\` = VALUES(\`key\`), source = VALUES(source)`,
      [
        tag.tag_id,
        truncated(tag.title, 64),
        truncated(tag.key, 120),
        truncated(tag.source, 32),
      ]
    );

    try {
      await pool.execute(
        "INSERT IGNORE INTO manga_tags (manga_id, tag_id) VALUES (?, ?)",
        [manga.manga_id, tag.tag_id]
      );
    } catch {
      // skip duplicate key
    }
  }
}

