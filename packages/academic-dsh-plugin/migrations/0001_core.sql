PRAGMA foreign_keys = ON;

CREATE TABLE event_streams (
  stream_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE domain_events (
  global_position INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  stream_id TEXT NOT NULL,
  stream_version INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  actor_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (stream_id, stream_version)
);

CREATE INDEX idx_events_stream ON domain_events (stream_id, stream_version);
CREATE INDEX idx_events_type_position ON domain_events (event_type, global_position);

CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY,
  command_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE TABLE consumer_checkpoints (
  consumer_id TEXT PRIMARY KEY,
  last_position INTEGER NOT NULL DEFAULT 0,
  projection_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projection_state (
  projection_id TEXT PRIMARY KEY,
  last_position INTEGER NOT NULL,
  projection_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO projection_state (projection_id, last_position, projection_version, updated_at)
VALUES ('core', 0, 1, '1970-01-01T00:00:00.000Z');

CREATE TABLE courses_current (
  course_id TEXT PRIMARY KEY,
  term_id TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  archived INTEGER NOT NULL,
  source_id TEXT,
  external_course_id TEXT,
  source_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_courses_source
  ON courses_current (source_id, external_course_id);

CREATE TABLE academic_items_current (
  item_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_kind TEXT NOT NULL,
  due_json TEXT NOT NULL,
  due_sort TEXT NOT NULL,
  source_url TEXT,
  source_id TEXT NOT NULL,
  external_item_id TEXT,
  source_updated_at TEXT,
  source_observed_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  progress_json TEXT NOT NULL,
  archived INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_items_source
  ON academic_items_current (source_id, external_item_id);
CREATE INDEX idx_items_course_due ON academic_items_current (course_id, due_sort);
CREATE INDEX idx_items_due ON academic_items_current (archived, due_sort);

CREATE TABLE study_tasks_current (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  item_id TEXT,
  estimate_minutes INTEGER NOT NULL,
  due_at TEXT,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE INDEX idx_tasks_due ON study_tasks_current (status, due_at);

CREATE TABLE study_plans_current (
  plan_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  range_json TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  locked_blocks_json TEXT NOT NULL,
  planner_json TEXT NOT NULL,
  replan_request_id TEXT,
  accepted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE INDEX idx_plans_status ON study_plans_current (status, accepted_at);

CREATE TABLE sync_runs (
  run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  items_seen INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  correlation_id TEXT
);

CREATE INDEX idx_sync_runs_source ON sync_runs (source_id, started_at);
