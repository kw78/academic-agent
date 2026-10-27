CREATE TABLE source_connections (
  connection_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_label TEXT,
  auth_kind TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  credential_ref TEXT,
  has_credential INTEGER NOT NULL DEFAULT 0,
  last_verified_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_connections_source ON source_connections (source_id);
