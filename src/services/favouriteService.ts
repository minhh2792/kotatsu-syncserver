import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/index";
import type { Category } from "../models/category";
import type { Favourite, FavouritesPackage } from "../models/favourite";
import { getMangaByIds, upsertManga } from "./mangaService";
import { truncated } from "../utils/string";

export async function syncFavourites(
  userId: number,
  favouritesSyncTimestamp: number | null,
  request: FavouritesPackage | null
): Promise<FavouritesPackage> {
  if (request !== null) {
    for (const category of request.categories) {
      await upsertCategory(category, userId);
    }
    for (const favourite of request.favourites) {
      await upsertManga(favourite.manga);
      await upsertFavourite(favourite, userId);
    }
  }

  const categories = await getCategoriesForUser(userId);
  const favourites = await getFavouritesForUser(userId);
  return {
    categories,
    favourites,
    timestamp: favouritesSyncTimestamp ?? 0,
  };
}

async function getCategoriesForUser(userId: number): Promise<Category[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, created_at, sort_key, title, \`order\`, track, show_in_lib, deleted_at
     FROM categories WHERE user_id = ?`,
    [userId]
  );
  return rows.map((row) => ({
    category_id: Number(row.id),
    created_at: Number(row.created_at),
    sort_key: Number(row.sort_key),
    track: Boolean(row.track),
    title: row.title as string,
    order: row.order as string,
    deleted_at: row.deleted_at != null ? Number(row.deleted_at) : 0,
    show_in_lib: Boolean(row.show_in_lib),
  }));
}

async function getFavouritesForUser(userId: number): Promise<Favourite[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT manga_id, category_id, sort_key, pinned, created_at, deleted_at
     FROM favourites WHERE user_id = ?`,
    [userId]
  );

  if (rows.length === 0) return [];

  const mangaIds = rows.map((r) => Number(r.manga_id));
  const mangaMap = await getMangaByIds(mangaIds);

  const result: Favourite[] = [];
  for (const row of rows) {
    const mangaId = Number(row.manga_id);
    const manga = mangaMap.get(mangaId);
    if (!manga) continue;
    result.push({
      manga_id: mangaId,
      manga,
      category_id: Number(row.category_id),
      sort_key: Number(row.sort_key),
      pinned: Boolean(row.pinned),
      created_at: Number(row.created_at),
      deleted_at: Number(row.deleted_at),
    });
  }
  return result;
}

async function upsertCategory(category: Category, userId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO categories (id, created_at, sort_key, title, \`order\`, track, show_in_lib, deleted_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       created_at = VALUES(created_at), sort_key = VALUES(sort_key),
       title = VALUES(title), \`order\` = VALUES(\`order\`),
       track = VALUES(track), show_in_lib = VALUES(show_in_lib),
       deleted_at = VALUES(deleted_at)`,
    [
      category.category_id,
      category.created_at,
      category.sort_key,
      truncated(category.title, 120),
      category.order,
      category.track ? 1 : 0,
      category.show_in_lib ? 1 : 0,
      category.deleted_at,
      userId,
    ]
  );
}

async function upsertFavourite(favourite: Favourite, userId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO favourites (manga_id, category_id, sort_key, pinned, created_at, deleted_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       sort_key = VALUES(sort_key), pinned = VALUES(pinned),
       created_at = VALUES(created_at), deleted_at = VALUES(deleted_at)`,
    [
      favourite.manga_id,
      favourite.category_id,
      favourite.sort_key,
      favourite.pinned ? 1 : 0,
      favourite.created_at,
      favourite.deleted_at,
      userId,
    ]
  );
}
