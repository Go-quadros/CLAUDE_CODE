-- Go Quadros Dashboard — PostgreSQL Schema

CREATE TABLE IF NOT EXISTS users (
  username     TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'colaborador',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR    NOT NULL COLLATE "default",
  sess   JSON       NOT NULL,
  expire TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

CREATE TABLE IF NOT EXISTS ml_tokens (
  account_key   TEXT PRIMARY KEY,
  seller_id     BIGINT,
  token         TEXT,
  refresh_token TEXT,
  nickname      TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clips (
  item_id    TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_campaigns (
  id           SERIAL PRIMARY KEY,
  account_key  TEXT NOT NULL,
  campaign_id  BIGINT NOT NULL,
  campaign_name TEXT,
  UNIQUE (account_key, campaign_id)
);

CREATE TABLE IF NOT EXISTS ads_manual_items (
  id          SERIAL PRIMARY KEY,
  account_key TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  UNIQUE (account_key, item_id)
);

CREATE TABLE IF NOT EXISTS ads_cache (
  account_key  TEXT PRIMARY KEY,
  gap_items    JSONB DEFAULT '[]',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manual_values (
  input_id   TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_cache (
  cache_key  TEXT PRIMARY KEY,
  amount     NUMERIC,
  cached_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default admin (password: goquadros2026)
INSERT INTO users (username, password_hash, name, role)
VALUES (
  'admin',
  '5820ea8952ef86b2222c6998230e0aaf6595d561e2bb8e48e7d5def5ea2fab7a',
  'Administrador',
  'master'
) ON CONFLICT DO NOTHING;
