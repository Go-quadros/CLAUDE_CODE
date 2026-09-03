require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const cors       = require('cors');
const path       = require('path');
const { pool, initDb } = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 8081;

// ── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SECRET_KEY || 'goquadros-dashboard-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/ml',      require('./routes/ml'));
app.use('/api/orders',  require('./routes/orders'));
app.use('/api/clips',   require('./routes/clips'));
app.use('/api/sales',   require('./routes/sales'));
app.use('/api/ads',     require('./routes/ads'));
app.use('/api/ads-gap', require('./routes/ads'));       // alias
app.use('/api/titulos', require('./routes/titles'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/feedbacks', require('./routes/feedbacks'));

// ML OAuth callback (redirect do ML → backend → frontend)
app.use('/callback', require('./routes/ml'));

// ── Serve React frontend em produção ────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── Start ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDb();
    console.log('✓ Banco de dados inicializado');
    app.listen(PORT, () => console.log(`✓ Servidor rodando na porta ${PORT}`));
  } catch (e) {
    console.error('Erro ao iniciar:', e);
    process.exit(1);
  }
})();
