CREATE TABLE replan_requests (
  replan_request_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  range_json TEXT NOT NULL,
  status TEXT NOT NULL,
  source_key TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  plan_id TEXT,
  suggestion_json TEXT,
  error_message TEXT
);

CREATE INDEX idx_replan_status ON replan_requests (status, created_at);
