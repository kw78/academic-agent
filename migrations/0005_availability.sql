CREATE TABLE user_availability (
  availability_id TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL,
  weekly_slots_json TEXT NOT NULL,
  temporary_blocks_json TEXT NOT NULL,
  granularity_minutes INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
