import type { Manga } from "./manga";

export interface History {
  manga_id: number;
  manga: Manga;
  created_at: number;
  updated_at: number;
  chapter_id: number;
  page: number;
  scroll: number;
  percent: number;
  chapters: number;
  deleted_at: number;
}

export interface HistoryPackage {
  history: History[];
  timestamp: number | null;
}
