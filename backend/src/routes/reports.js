const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Geração de PDF via endpoint — mantém compatibilidade com o frontend
// O frontend atual usa window.print() para o Fechamento; aqui servimos o PDF de projeções/comparativo
router.post('/pdf', requireAuth, (req, res) => {
  // Delega ao frontend: retorna o payload para o cliente gerar via print()
  // Para PDFs server-side, instale puppeteer ou pdfkit futuramente
  res.json({ ok: true, message: 'Use a função de exportação no frontend' });
});

module.exports = router;
