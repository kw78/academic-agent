CREATE TABLE course_source_aliases (
  source_id TEXT NOT NULL,
  external_course_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, external_course_id)
);

CREATE INDEX idx_course_source_aliases_course
  ON course_source_aliases (course_id);
