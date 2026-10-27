ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX idx_notifications_dedupe
  ON notifications (consumer_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE notification_settings (
  settings_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  thresholds_hours_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
