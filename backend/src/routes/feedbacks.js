const router  = require('express').Router();
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Listar todos (mais recentes primeiro)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const values = [];
  let where = '';
  if (status && status !== 'todos') {
    values.push(status);
    where = `WHERE status = $1`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM feedbacks ${where} ORDER BY created_at DESC`,
    values
  );
  res.json({ feedbacks: rows });
});

// Criar
router.post('/', async (req, res) => {
  const { mlb, pedido_id, canal, motivo, descricao } = req.body;
  if (!motivo) return res.status(400).json({ message: 'Motivo obrigatório.' });

  const { rows } = await pool.query(
    `INSERT INTO feedbacks (mlb, pedido_id, canal, motivo, descricao)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [mlb || null, pedido_id || null, canal || null, motivo, descricao || null]
  );
  res.json({ ok: true, feedback: rows[0] });
});

// Atualizar status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['pendente', 'resolvido'].includes(status))
    return res.status(400).json({ message: 'Status inválido.' });

  const resolved_at = status === 'resolvido' ? 'NOW()' : 'NULL';
  const { rows } = await pool.query(
    `UPDATE feedbacks SET status = $1, resolved_at = ${resolved_at}
     WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Não encontrado.' });
  res.json({ ok: true, feedback: rows[0] });
});

// Excluir
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM feedbacks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
