CREATE TABLE materials (
  material_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  item_id TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT,
  origin_label TEXT,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  page_count INTEGER,
  extraction_status TEXT NOT NULL,
  extraction_note TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_materials_course_sha ON materials (course_id, sha256);
CREATE INDEX idx_materials_course ON materials (course_id, created_at);
CREATE INDEX idx_materials_item ON materials (item_id);

CREATE TABLE material_chunks (
  chunk_id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(material_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  page INTEGER,
  heading TEXT,
  text TEXT NOT NULL
);

CREATE INDEX idx_material_chunks_material ON material_chunks (material_id, ordinal);

CREATE VIRTUAL TABLE material_chunks_fts USING fts5(
  text,
  heading,
  tokenize = 'trigram'
);

CREATE TABLE material_source_subscriptions (
  source_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, course_id)
);
