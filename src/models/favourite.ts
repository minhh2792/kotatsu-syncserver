import type { Manga } from "./manga";
import type { Category } from "./category";

export interface Favourite {
  manga_id: number;
  manga: Manga;
  category_id: number;
  sort_key: number;
  pinned: boolean;
  created_at: number;
  deleted_at: number;
}

export interface FavouritesPackage {
  categories: Category[];
  favourites: Favourite[];
  timestamp: number | null;
}
