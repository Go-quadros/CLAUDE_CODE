const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getTokens, saveTokens, getAllAccounts, CLIENT_ID, CLIENT_SECRET } = require('../lib/ml');

const router = express.Router();

const REDIRECT_URI = process.env.ML_REDIRECT_URI;

// Status das contas conectadas
router.get('/accounts', requireAuth, async (req, res) => {
  const accounts = await getAllAccounts();
  res.json(accounts.map(a => ({
    key: a.account_key,
    name: a.name,
    connected: !!a.token,
    seller_id: a.seller_id,
    nickname: a.nickname,
  })));
});

// Inicia OAuth para uma conta
router.get('/connect/:accountKey', requireAuth, (req, res) => {
  const { accountKey } = req.params;
  if (!['freewall', 'nova_gq'].includes(accountKey)) {
    return res.status(400).json({ error: 'Conta inválida' });
  }
  const url = new URL('https://auth.mercadolivre.com.br/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', accountKey);
  url.searchParams.set('scope', 'offline_access product_ads');
  res.json({ auth_url: url.toString() });
});

// Callback OAuth
router.get('/callback', async (req, res) => {
  const { code, state: accountKey } = req.query;
  if (!code || !accountKey) return res.redirect('/?error=oauth');

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) return res.redirect('/?error=token');
  const d = await tokenRes.json();

  const meRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${d.access_token}` },
  });
  const me = await meRes.json();

  await saveTokens(accountKey, {
    token: d.access_token,
    refresh_token: d.refresh_token,
    seller_id: me.id,
    nickname: me.nickname,
  });

  res.redirect('/?connected=' + accountKey);
});

module.exports = router;
