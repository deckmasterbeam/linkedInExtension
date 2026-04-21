CREATE TABLE IF NOT EXISTS profile_view_log (
  id               SERIAL PRIMARY KEY,
  viewer_username  TEXT        NOT NULL,
  viewed_username  TEXT        NOT NULL,
  is_connected     BOOLEAN     NOT NULL,
  viewed_at        TIMESTAMPTZ NOT NULL,
  logged_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_view_log_viewer  ON profile_view_log (viewer_username);
CREATE INDEX IF NOT EXISTS idx_profile_view_log_viewed  ON profile_view_log (viewed_username);
CREATE INDEX IF NOT EXISTS idx_profile_view_log_viewed_at ON profile_view_log (viewed_at);
