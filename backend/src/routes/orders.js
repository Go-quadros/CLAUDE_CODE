const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mlGet, getAllAccounts, ACCOUNTS_META } = require('../lib/ml');
const { pool } = require('../db/pool');

const router = express.Router();

const COR_PALAVRAS = [
  'marrom-escuro', 'marrom-claro', 'marrom', 'preto', 'branco', 'off white',
  'nogueira', 'freijó', 'freijo', 'cinza', 'dourado', 'prata', 'natural',
];
const COR_MAP = { marrom: 'Nogueira', 'marrom-escuro': 'Nogueira', 'marrom-claro': 'Freijó' };

function extractCor(text) {
  const t = (text || '').toLowerCase();
  const found = COR_PALAVRAS.find(p => t.includes(p));
  return found || '—';
}
function normalizeCor(cor) {
  if (!cor || cor === '—') return '—';
  return COR_MAP[cor.toLowerCase()] || cor;
}
function pickAttr(attrs, ...keys) {
  for (const k of keys) {
    const v = attrs[k.toLowerCase()];
    if (v && v !== '—') return v;
  }
  return '—';
}
function extractFromTitle(title) {
  const t = title || '';
  const m = t.match(/\d{2,3}[xX]\d{2,3}/);
  const vidro = /vidro/i.test(t);
  const semVidro = /sem\s+vidro/i.test(t);
  return {
    tamanho: m ? m[0] : '40x60',
    acabamento: semVidro ? 'Sem Vidro' : (vidro ? 'Com Vidro' : 'Sem Vidro'),
  };
}
function nextBizDay(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

async function fetchItemsBatch(accountKey, itemIds) {
  const result = {};
  const ids = [...new Set(itemIds)];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const data = await mlGet(accountKey, '/items', { ids: batch.join(',') });
    if (Array.isArray(data)) {
      for (const entry of data) {
        const body = entry.body || {};
        if (body.id) result[body.id] = body;
      }
    }
  }
  return result;
}

async function fetchShipBy(accountKey, shipmentId) {
  try {
    const data = await mlGet(accountKey, `/shipments/${shipmentId}`);
    if (!data) return null;
    const edt = data.shipping_option?.estimated_delivery_time || {};
    const pb = edt.pay_before;
    if (pb?.length >= 10) return pb.slice(0, 10);
    return data.shipping_option?.buffering?.date?.slice(0, 10) || null;
  } catch { return null; }
}

async function getOrdersForAccount(accountKey, acc, dateFrom, dateTo, clipIds) {
  if (!acc.token || !acc.seller_id) return [];

  const allOrders = [];
  let offset = 0;
  while (true) {
    const params = {
      seller: acc.seller_id, 'order.status': 'paid',
      'order.date_created.from': dateFrom || new Date(Date.now() - 30*86400000).toISOString().slice(0,10) + 'T00:00:00.000-0300',
      limit: 50, offset,
    };
    if (dateTo) params['order.date_created.to'] = dateTo;
    const data = await mlGet(accountKey, '/orders/search', params);
    if (!data?.results?.length) break;
    allOrders.push(...data.results);
    offset += 50;
    if (offset >= (data.paging?.total || 0)) break;
  }

  const itemIds = [
    ...new Set(allOrders.flatMap(o => o.order_items.map(i => i.item?.id).filter(Boolean)))
  ];
  const cache = await fetchItemsBatch(accountKey, itemIds);
  const meta = ACCOUNTS_META[accountKey] || {};

  const seen = {};
  const results = [];

  for (const order of allOrders) {
    for (const item of order.order_items || []) {
      const itemId = item.item?.id;
      if (!itemId) continue;
      if (clipIds.size > 0 && !clipIds.has(itemId)) continue;

      const itemData = cache[itemId] || {};
      const variationId = item.item?.variation_id;
      let variationAttrs = {};
      let sku = null;

      if (variationId) {
        for (const v of itemData.variations || []) {
          if (String(v.id) === String(variationId)) {
            for (const attr of v.attribute_combinations || []) {
              variationAttrs[attr.name?.toLowerCase()] = attr.value_name || '—';
            }
            sku = v.seller_custom_field || v.user_product_id || v.seller_sku;
            break;
          }
        }
      }
      if (!Object.keys(variationAttrs).length) {
        for (const attr of itemData.attributes || []) {
          variationAttrs[attr.name?.toLowerCase()] = attr.value_name || '—';
        }
      }
      if (!sku) sku = itemData.seller_custom_field || itemData.seller_sku || '—';

      const title = item.item?.title || '';
      const extracted = extractFromTitle(title);
      const rawCor = pickAttr(variationAttrs, 'cor da armação', 'cor da moldura', 'cor', 'color');
      const corMoldura = normalizeCor(rawCor);
      const shipBy = nextBizDay(order.date_created);
      const shippingId = String(order.shipping?.id || '');

      const key = `${itemId}_${variationId || 'base'}`;
      if (seen[key]) {
        seen[key].quantity += item.quantity || 1;
        seen[key].order_ids.push(String(order.id));
      } else {
        const entry = {
          order_id: order.id, order_ids: [String(order.id)],
          date: order.date_created, ship_by: shipBy,
          _shipping_id: shippingId, channel: meta.name || accountKey,
          item_id: itemId, title: title || '—',
          thumbnail: itemData.thumbnail || '',
          sku: sku || '—', quantity: item.quantity || 1,
          tamanho: extracted.tamanho, moldura: meta.moldura || '—',
          cor_moldura: corMoldura, acabamento: extracted.acabamento,
        };
        seen[key] = entry;
        results.push(entry);
      }
    }
  }

  // Busca datas reais de despacho (em paralelo, com timeout)
  const sids = [...new Set(results.map(r => r._shipping_id).filter(Boolean))];
  if (sids.length) {
    const realDates = await Promise.allSettled(
      sids.map(sid => fetchShipBy(accountKey, sid).then(d => [sid, d]))
    );
    const dateMap = {};
    for (const r of realDates) {
      if (r.status === 'fulfilled' && r.value[1]) dateMap[r.value[0]] = r.value[1];
    }
    for (const entry of results) {
      if (entry._shipping_id && dateMap[entry._shipping_id]) {
        entry.ship_by = dateMap[entry._shipping_id];
      }
      delete entry._shipping_id;
    }
  } else {
    results.forEach(r => delete r._shipping_id);
  }

  return results;
}

router.get('/', requireAuth, async (req, res) => {
  const { date_from, date_to } = req.query;
  const { rows: clipRows } = await pool.query('SELECT item_id FROM clips');
  const clipIds = new Set(clipRows.map(r => r.item_id));

  const accounts = await getAllAccounts();
  const allOrders = (
    await Promise.all(accounts.map(acc => getOrdersForAccount(acc.account_key, acc, date_from, date_to, clipIds)))
  ).flat();

  allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(allOrders);
});

module.exports = router;
