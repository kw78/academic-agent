CREATE TABLE notification_activations (
  activation_id TEXT PRIMARY KEY,
  last_position INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notifications (
  notification_id TEXT PRIMARY KEY,
  consumer_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  activation_position INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (consumer_id, event_id)
);

CREATE INDEX idx_notifications_created ON notifications (created_at);
