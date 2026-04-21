CREATE TABLE IF NOT EXISTS install_log (
  id                SERIAL PRIMARY KEY,
  linkedin_username TEXT        NOT NULL,
  installed_at      TIMESTAMPTZ NOT NULL,
  logged_at         TIMESTAMPTZ DEFAULT NOW()
);
