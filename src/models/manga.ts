export interface MangaTag {
  tag_id: number;
  title: string;
  key: string;
  source: string;
}

export interface Manga {
  manga_id: number;
  title: string;
  alt_title: string | null;
  url: string;
  public_url: string;
  rating: number;
  content_rating: string | null;
  cover_url: string;
  large_cover_url: string | null;
  tags: MangaTag[];
  state: string | null;
  author: string | null;
  source: string;
}
