const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { mlGet, getTokens, refreshToken } = require('../lib/ml');

const router = express.Router();

async function getCampaignItemsAPI(accountKey, campaignIds) {
  const acc = await getTokens(accountKey);
  if (!acc?.token) return { items: new Set(), ok: false };
  const items = new Set();

  for (const campId of campaignIds) {
    let token = acc.token;
    let res = await fetch(
      `https://api.mercadolibre.com/advertising/product_ads/campaigns/${campId}/ad_items?limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 401) {
      const newToken = await refreshToken(accountKey);
      if (!newToken) return { items, ok: false };
      token = newToken;
      res = await fetch(
        `https://api.mercadolibre.com/advertising/product_ads/campaigns/${campId}/ad_items?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }
    if (res.status === 403) return { items, ok: false };
    if (!res.ok) continue;
    const data = await res.json();
    const results = Array.isArray(data) ? data : (data.results || []);
    for (const it of results) {
      const id = it.item_id || it.id;
      if (id) items.add(String(id));
    }
  }
  return { items, ok: true };
}

async function getMLItemsWithSales(accountKey) {
  const acc = await getTokens(accountKey);
  if (!acc?.seller_id) return [];
  const queries = [
    { q: '30x45' }, { q: '40x60' }, { q: '50x70' }, { q: '60x90' },
    { q: 'Decorativo Sala' }, { q: 'Decorativo Quarto' },
  ];
  const seen = new Set();
  const items = [];

  for (const params of queries) {
    let offset = 0;
    while (true) {
      const data = await mlGet(accountKey, `/users/${acc.seller_id}/items/search`, {
        ...params, status: 'active', limit: 100, offset,
      });
      if (!data?.results?.length) break;
      const ids = data.results;
      const details = await mlGet(accountKey, '/items', { ids: ids.join(',') });
      if (Array.isArray(details)) {
        for (const entry of details) {
          const b = entry.body || {};
          if (b.id && !seen.has(b.id) && (b.sold_quantity || 0) > 0) {
            seen.add(b.id);
            items.push({ id: b.id, title: b.title, sold_quantity: b.sold_quantity });
          }
        }
      }
      offset += ids.length;
      if (offset + 100 > 1000 || offset >= (data.paging?.total || 0)) break;
    }
  }
  return items;
}

// GET /api/ads-gap/:accountKey
router.get('/:accountKey', requireAuth, async (req, res) => {
  const { accountKey } = req.params;

  // Campanhas configuradas
  const { rows: campRows } = await pool.query(
    'SELECT campaign_id FROM ads_campaigns WHERE account_key = $1', [accountKey]
  );
  const campaignIds = campRows.map(r => r.campaign_id);

  // Itens manuais
  const { rows: manualRows } = await pool.query(
    'SELECT item_id FROM ads_manual_items WHERE account_key = $1', [accountKey]
  );
  const manualIds = new Set(manualRows.map(r => r.item_id));

  let adItems = new Set();
  let mode = 'manual';

  if (campaignIds.length) {
    const { items, ok } = await getCampaignItemsAPI(accountKey, campaignIds);
    if (ok) { adItems = items; mode = 'api'; }
    else adItems = manualIds;
  } else {
    adItems = manualIds;
  }

  const soldItems = await getMLItemsWithSales(accountKey);
  const gap = soldItems.filter(i => !adItems.has(i.id));

  // Cache
  await pool.query(
    'INSERT INTO ads_cache (account_key, gap_items, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (account_key) DO UPDATE SET gap_items = $2, updated_at = NOW()',
    [accountKey, JSON.stringify(gap)]
  );

  res.json({
    mode, total_sold: soldItems.length, in_ads: adItems.size, gap: gap.length, items: gap,
  });
});

// GET /api/ads-config/:accountKey
router.get('/config/:accountKey', requireAuth, async (req, res) => {
  const { accountKey } = req.params;
  const { rows: camps } = await pool.query(
    'SELECT campaign_id, campaign_name FROM ads_campaigns WHERE account_key = $1', [accountKey]
  );
  const { rows: manual } = await pool.query(
    'SELECT item_id FROM ads_manual_items WHERE account_key = $1', [accountKey]
  );
  res.json({ campaigns: camps, manual_items: manual.map(r => r.item_id) });
});

// POST /api/ads-config/:accountKey/items — salva MLBs manuais
router.post('/config/:accountKey/items', requireAuth, async (req, res) => {
  const { accountKey } = req.params;
  const { items, campaigns } = req.body;

  if (campaigns?.length) {
    await pool.query('DELETE FROM ads_campaigns WHERE account_key = $1', [accountKey]);
    for (const c of campaigns) {
      await pool.query(
        'INSERT INTO ads_campaigns (account_key, campaign_id, campaign_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [accountKey, c.id, c.name]
      );
    }
  }

  if (items?.length) {
    await pool.query('DELETE FROM ads_manual_items WHERE account_key = $1', [accountKey]);
    for (const id of items) {
      await pool.query(
        'INSERT INTO ads_manual_items (account_key, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [accountKey, id]
      );
    }
  }

  res.json({ ok: true });
});

module.exports = router;
