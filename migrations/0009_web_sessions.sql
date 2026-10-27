CREATE TABLE web_sessions (
  session_id TEXT PRIMARY KEY,
  login_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  label TEXT,
  vault_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX idx_web_sessions_domain ON web_sessions (domain);
CREATE INDEX idx_web_sessions_updated ON web_sessions (updated_at);
