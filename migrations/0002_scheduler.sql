CREATE TABLE scheduled_jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_due ON scheduled_jobs (enabled, next_run_at);

CREATE TABLE job_runs (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  error_code TEXT,
  error_message TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_job_runs_job ON job_runs (job_id, started_at);

CREATE TABLE job_leases (
  job_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
