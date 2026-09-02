const express = require('express');
const crypto  = require('crypto');
const { pool } = require('../db/pool');
const { requireMaster } = require('../middleware/auth');

const router = express.Router();
const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

router.get('/', requireMaster, async (req, res) => {
  const { rows } = await pool.query('SELECT username, name, role FROM users ORDER BY username');
  res.json(rows);
});

router.post('/', requireMaster, async (req, res) => {
  const { username, name, password } = req.body;
  if (!username?.trim() || !name?.trim() || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos' });
  }
  try {
    await pool.query(
      'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)',
      [username.trim(), hashPw(password), name.trim(), 'colaborador']
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Usuário já existe' });
    throw e;
  }
});

router.delete('/:username', requireMaster, async (req, res) => {
  if (req.params.username === req.session.user) {
    return res.status(400).json({ error: 'Não é possível remover a si mesmo' });
  }
  const { rowCount } = await pool.query('DELETE FROM users WHERE username = $1', [req.params.username]);
  if (!rowCount) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ ok: true });
});

router.put('/:username/password', requireMaster, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha não pode ser vazia' });
  const { rowCount } = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE username = $2',
    [hashPw(password), req.params.username]
  );
  if (!rowCount) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ ok: true });
});

router.put('/:username/rename', requireMaster, async (req, res) => {
  const { new_username, new_name } = req.body;
  if (!new_username?.trim()) return res.status(400).json({ error: 'Login não pode ser vazio' });
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [req.params.username]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (new_username !== req.params.username) {
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [new_username]);
    if (exists.rows[0]) return res.status(400).json({ error: 'Esse login já está em uso' });
  }

  await pool.query(
    'UPDATE users SET username = $1, name = COALESCE($2, name) WHERE username = $3',
    [new_username.trim(), new_name?.trim() || null, req.params.username]
  );
  res.json({ ok: true });
});

module.exports = router;
