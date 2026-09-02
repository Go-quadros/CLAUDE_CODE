const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { mlGet, getTokens } = require('../lib/ml');

const router = express.Router();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchMLPeriodTotal(accountKey, dateFrom, dateTo) {
  const acc = await getTokens(accountKey);
  if (!acc?.seller_id) return null;
  let total = 0;
  let offset = 0;
  while (true) {
    const data = await mlGet(accountKey, '/orders/search', {
      seller: acc.seller_id,
      'order.status': 'paid',
      'order.date_created.from': `${dateFrom}T00:00:00.000-0300`,
      'order.date_created.to':   `${dateTo}T23:59:59.000-0300`,
      limit: 50, offset,
    });
    if (!data) break;
    const results = data.results || [];
    for (const order of results) total += parseFloat(order.total_amount || 0);
    offset += results.length;
    if (offset >= (data.paging?.total || 0) || !results.length) break;
  }
  return total;
}

// GET /api/sales/collect?accounts=freewall,nova_gq&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&force=1
router.get('/collect', requireAuth, async (req, res) => {
  const { accounts: accountsParam, date_from, date_to, force } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from e date_to obrigatórios' });

  const accountKeys = accountsParam ? accountsParam.split(',') : ['freewall', 'nova_gq'];
  const results = {};

  for (const key of accountKeys) {
    const cacheKey = `${key}:${date_from}:${date_to}`;
    if (force !== '1') {
      const { rows } = await pool.query(
        'SELECT amount, cached_at FROM sales_cache WHERE cache_key = $1', [cacheKey]
      );
      if (rows[0]) {
        const age = Date.now() - new Date(rows[0].cached_at).getTime();
        if (age < CACHE_TTL_MS) { results[key] = parseFloat(rows[0].amount); continue; }
      }
    }
    const amount = await fetchMLPeriodTotal(key, date_from, date_to);
    if (amount !== null) {
      await pool.query(
        'INSERT INTO sales_cache (cache_key, amount, cached_at) VALUES ($1, $2, NOW()) ON CONFLICT (cache_key) DO UPDATE SET amount = $2, cached_at = NOW()',
        [cacheKey, amount]
      );
      results[key] = amount;
    }
  }

  res.json(results);
});

// POST /api/sales/manual — salva valores digitados pelo usuário
router.post('/manual', requireAuth, async (req, res) => {
  const values = req.body; // { input_id: value, ... }
  for (const [inputId, value] of Object.entries(values)) {
    if (value === '' || value === null || value === undefined) continue;
    await pool.query(
      'INSERT INTO manual_values (input_id, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (input_id) DO UPDATE SET value = $2, updated_at = NOW()',
      [inputId, String(value)]
    );
  }
  res.json({ ok: true });
});

// GET /api/sales/manual — carrega todos os valores manuais
router.get('/manual', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT input_id, value FROM manual_values');
  const result = {};
  for (const row of rows) result[row.input_id] = row.value;
  res.json(result);
});

module.exports = router;
