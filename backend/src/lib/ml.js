const { pool } = require('../db/pool');

const ML_BASE = 'https://api.mercadolibre.com';
const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

const ACCOUNTS_META = {
  freewall: { name: 'Freewall Decoração', moldura: 'Caixinha' },
  nova_gq:  { name: 'GQ Decoração',       moldura: 'Filete'   },
};

async function getTokens(accountKey) {
  const { rows } = await pool.query(
    'SELECT * FROM ml_tokens WHERE account_key = $1', [accountKey]
  );
  return rows[0] || null;
}

async function saveTokens(accountKey, { token, refresh_token, seller_id, nickname }) {
  await pool.query(`
    INSERT INTO ml_tokens (account_key, token, refresh_token, seller_id, nickname, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (account_key) DO UPDATE
      SET token = $2, refresh_token = $3,
          seller_id = COALESCE($4, ml_tokens.seller_id),
          nickname  = COALESCE($5, ml_tokens.nickname),
          updated_at = NOW()
  `, [accountKey, token, refresh_token, seller_id, nickname]);
}

async function refreshToken(accountKey) {
  const acc = await getTokens(accountKey);
  if (!acc?.refresh_token) return false;
  const res = await fetch(`${ML_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: acc.refresh_token,
    }),
  });
  if (!res.ok) return false;
  const d = await res.json();
  await saveTokens(accountKey, {
    token: d.access_token,
    refresh_token: d.refresh_token || acc.refresh_token,
  });
  return d.access_token;
}

async function mlGet(accountKey, path, params = {}) {
  const acc = await getTokens(accountKey);
  if (!acc?.token) return null;

  const url = new URL(`${ML_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${acc.token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 401) {
    const newToken = await refreshToken(accountKey);
    if (!newToken) return null;
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}` },
      signal: AbortSignal.timeout(10000),
    });
  }

  return res.ok ? res.json() : null;
}

async function mlPost(accountKey, path, body = {}) {
  const acc = await getTokens(accountKey);
  if (!acc?.token) return null;

  const doReq = (token) =>
    fetch(`${ML_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

  let res = await doReq(acc.token);
  if (res.status === 401) {
    const newToken = await refreshToken(accountKey);
    if (!newToken) return null;
    res = await doReq(newToken);
  }
  return res.ok ? res.json() : null;
}

async function getAllAccounts() {
  const { rows } = await pool.query('SELECT * FROM ml_tokens');
  return rows.map(r => ({
    ...r,
    ...ACCOUNTS_META[r.account_key],
  }));
}

module.exports = { mlGet, mlPost, getTokens, saveTokens, refreshToken, getAllAccounts, ACCOUNTS_META, CLIENT_ID, CLIENT_SECRET };
