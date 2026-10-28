CREATE TABLE adapter_manifests (
  adapter_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'validated', 'revoked')),
  manifest_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (adapter_id, version)
);

CREATE INDEX idx_adapter_manifests_status ON adapter_manifests (status);

CREATE TABLE adapter_active (
  adapter_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (adapter_id, version)
    REFERENCES adapter_manifests (adapter_id, version)
);
