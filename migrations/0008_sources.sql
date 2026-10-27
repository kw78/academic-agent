CREATE TABLE academic_sources (
  source_id TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  display_name TEXT NOT NULL,
  auth_kind TEXT NOT NULL,
  login_mode TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_sources_engine ON academic_sources (engine);
CREATE INDEX idx_sources_enabled ON academic_sources (enabled, archived);
