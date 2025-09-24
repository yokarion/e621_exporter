export interface Post {
  id: number;
  uploader_id: number;
  created_at: string; // ISO date string
  md5: string;
  source: string;
  rating: "s" | "q" | "e"; // safe, questionable, explicit
  image_width: number;
  image_height: number;
  tag_string: string;
  locked_tags: string;
  fav_count: number;
  file_ext: string;
  parent_id: number | null;
  change_seq: number;
  approver_id: number | null;
  file_size: number;
  comment_count: number;
  description: string;
  duration: number | null;
  updated_at: string; // ISO date string
  is_deleted: boolean;
  is_pending: boolean;
  is_flagged: boolean;
  score: number;
  up_score: number;
  down_score: number;
  is_rating_locked: boolean;
  is_status_locked: boolean;
  is_note_locked: boolean;
}

export interface Pool {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  creator_id: number;
  description: string;
  is_active: boolean;
  category: number;
  post_ids: string; // comma-separated list of post IDs
}

export interface TagAlias {
  id: number;
  antecedent_name: string;
  consequent_name: string;
  created_at: string;
  status: string; // e.g., "pending", "active"
}

export interface TagImplication {
  id: number;
  antecedent_name: string;
  consequent_name: string;
  created_at: string;
  status: string;
}

export interface Tag {
  id: number;
  name: string;
  category: number;
  post_count: number;
}

export interface WikiPage {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  body: string;
  creator_id: number;
  updater_id: number;
  is_locked: boolean;
}
