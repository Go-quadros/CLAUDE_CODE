const express = require('express');
const crypto  = require('crypto');
const { pool } = require('../db/pool');

const router = express.Router();

const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  const user = rows[0];

  if (!user || user.password_hash !== hashPw(password)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  }

  req.session.user = user.username;
  req.session.name = user.name;
  req.session.role = user.role;

  res.json({ username: user.username, name: user.name, role: user.role });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
  res.json({ username: req.session.user, name: req.session.name, role: req.session.role });
});

module.exports = router;
