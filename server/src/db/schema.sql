CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  source_type TEXT,
  source_url TEXT,
  current_time REAL,
  is_playing INTEGER,
  updated_at INTEGER
);
