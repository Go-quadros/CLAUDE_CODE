const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT item_id FROM clips');
  res.json(rows.map(r => r.item_id));
});

router.delete('/:item_id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM clips WHERE item_id = $1', [req.params.item_id.toUpperCase()]);
  res.json({ ok: true });
});

router.post('/bulk', requireAuth, async (req, res) => {
  const ids = (req.body.ids || []).map(id => id.toUpperCase());
  if (!ids.length) return res.json({ added: 0 });
  const before = (await pool.query('SELECT COUNT(*) FROM clips')).rows[0].count;
  for (const id of ids) {
    await pool.query('INSERT INTO clips (item_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  }
  const after = (await pool.query('SELECT COUNT(*) FROM clips')).rows[0].count;
  res.json({ added: after - before, total: Number(after) });
});

router.post('/bulk-remove', requireAuth, async (req, res) => {
  const ids = (req.body.ids || []).map(id => id.toUpperCase());
  if (!ids.length) return res.json({ removed: 0 });
  const before = (await pool.query('SELECT COUNT(*) FROM clips')).rows[0].count;
  for (const id of ids) {
    await pool.query('DELETE FROM clips WHERE item_id = $1', [id]);
  }
  const after = (await pool.query('SELECT COUNT(*) FROM clips')).rows[0].count;
  res.json({ removed: before - after, total: Number(after) });
});

module.exports = router;
