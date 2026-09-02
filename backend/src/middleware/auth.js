function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

function requireMaster(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
  if (req.session.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  next();
}

module.exports = { requireAuth, requireMaster };
