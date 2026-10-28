CREATE TABLE IF NOT EXISTS user_preferences (
  preference_id TEXT PRIMARY KEY,
  course_priorities_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
