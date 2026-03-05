import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/index";
import type { Manga, MangaTag } from "../models/manga";
import { truncated } from "../utils/string";

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
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, alt_title, url, public_url, rating, content_rating,
            cover_url, large_cover_url, state, author, source
     FROM manga WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const tags = await getMangaTags(id);
  return mapManga(rows[0], tags);
}

export async function getMangaList(offset: number, limit: number): Promise<Manga[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, alt_title, url, public_url, rating, content_rating,
            cover_url, large_cover_url, state, author, source
     FROM manga LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const result: Manga[] = [];
  for (const row of rows) {
    const tags = await getMangaTags(Number(row.id));
    result.push(mapManga(row, tags));
  }
  return result;
}

async function getMangaTags(mangaId: number): Promise<MangaTag[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.id, t.title, t.key, t.source
     FROM tags t
     INNER JOIN manga_tags mt ON mt.tag_id = t.id
     WHERE mt.manga_id = ?`,
    [mangaId]
  );
  return rows.map((r) => ({
    tag_id: Number(r.id),
    title: r.title as string,
    key: r.key as string,
    source: r.source as string,
  }));
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
