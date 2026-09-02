const express = require('express');
const { requireMaster } = require('../middleware/auth');
const { mlGet, getTokens } = require('../lib/ml');

const router = express.Router();

const KEYWORDS = {
  lugares1: [
    { term: 'Sala De Estar' }, { term: 'Quarto' }, { term: 'Escritório' },
    { term: 'Cozinha' }, { term: 'Banheiro' }, { term: 'Corredor' },
  ],
  lugares2: [
    { term: 'Apartamento' }, { term: 'Casa' }, { term: 'Espaço' },
  ],
  materiais: [
    { term: 'Canvas' }, { term: 'Tela' }, { term: 'Madeira' }, { term: 'Poster' },
  ],
};

function clean(s) { return s.replace(/\s+/g, ' ').trim(); }

function fillTo(base, min, max, fillers) {
  let title = base;
  for (const word of fillers) {
    if (title.length >= min) break;
    const candidate = clean(title + ' ' + word);
    if (candidate.length <= max) title = candidate;
  }
  return title;
}

function tituloML(estilo, nome, quantidade, tamanho, vidro, contaKey) {
  const filete = contaKey === 'nova_gq';
  const kitStr = { avulso: '', duo: 'Kit ', trio: 'Trio ' }[quantidade] || '';
  const suffix = filete ? ' Filete' : '';
  const tmin = 57 - suffix.length;
  const tmax = 60 - suffix.length;

  let bases;
  if (filete) {
    bases = vidro
      ? [`Quadro Com Moldura E Vidro ${kitStr}${estilo} ${tamanho} ${nome}`,
         `Quadro Decorativo Com Vidro ${kitStr}${estilo} ${tamanho} ${nome}`]
      : [`Quadro Decorativo Com Moldura ${kitStr}${estilo} ${tamanho} ${nome}`,
         `Quadro Decorativo Sala ${kitStr}${estilo} ${tamanho} ${nome}`];
  } else {
    bases = vidro
      ? [`Quadro Sala Quarto Com Vidro Moldura ${tamanho} ${kitStr}${estilo} ${nome}`,
         `Quadro Decorativo Sala Quarto Vidro ${tamanho} ${kitStr}${estilo} ${nome}`]
      : [`Quadro Decorativo Sala Quarto ${tamanho} ${kitStr}${estilo} ${nome}`,
         `Quadro Decorativo Quarto Sala ${tamanho} ${kitStr}${estilo} ${nome}`];
  }

  const fillers = filete
    ? ['Grande', 'Sala', 'Para Sala']
    : ['Moldura', 'Poster', 'Arte', 'Grande', 'Com Moldura'];

  return bases.map(rawBase => {
    let base   = clean(rawBase);
    let filled = fillTo(base, tmin, tmax, fillers);
    if (filled.length > tmax) filled = filled.slice(0, tmax).replace(/\s\S+$/, '');
    const final = clean(filled + suffix).slice(0, 60);
    const nomeOk = !nome || nome.split(' ')[0].toLowerCase().includes(final.toLowerCase().split(' ')[0]);
    return { title: final, chars: final.length, ok: final.length >= 57 && final.length <= 60 };
  });
}

function tituloShopee(estilo, nome, quantidade, contaKey) {
  const filete = contaKey === 'freewall';
  const kitStr = { avulso: '', duo: 'Kit ', trio: 'Trio ' }[quantidade] || '';
  const fl = filete ? ' Filete' : '';
  const tema = clean(`${estilo} ${nome}`);

  const l1Pool = KEYWORDS.lugares1.slice(1).map(k => k.term);
  const matPool = KEYWORDS.materiais.map(k => k.term);
  const l2Pool  = KEYWORDS.lugares2.map(k => k.term);
  const fillers = [...l1Pool.slice(0, 4), ...matPool.slice(0, 4), ...l2Pool.slice(0, 3)];

  const templates = [
    clean(`Quadro Decorativo Sala ${kitStr}${tema}${fl}`),
    clean(`Quadro Decorativo Sala ${kitStr}${tema} Decorativo${fl}`),
    clean(`Quadros Decorativos Sala ${kitStr}${tema}${fl}`),
  ];

  return templates.map(base => {
    const title = fillTo(base, 96, 99, fillers).slice(0, 99);
    return { title, chars: title.length, ok: title.length >= 96 && title.length <= 99 };
  });
}

router.post('/gerar', requireMaster, (req, res) => {
  const { plataforma = 'ml', conta = 'nova_gq', estilo = '', nome = '', quantidade = 'avulso', tamanho = '40x60', vidro = false } = req.body;
  if (!estilo.trim()) return res.status(400).json({ error: 'Informe o estilo/categoria' });

  const titulos = plataforma === 'ml'
    ? tituloML(estilo.trim(), (nome || '').trim(), quantidade, tamanho, !!vidro, conta)
    : tituloShopee(estilo.trim(), (nome || '').trim(), quantidade, conta);

  res.json({ titulos });
});

router.get('/existentes', requireMaster, async (req, res) => {
  const existentes = [];
  for (const key of ['freewall', 'nova_gq']) {
    const acc = await getTokens(key);
    if (!acc?.token || !acc?.seller_id) continue;
    let offset = 0;
    while (true) {
      const data = await mlGet(key, `/users/${acc.seller_id}/items/search`, {
        status: 'active', limit: 100, offset,
      });
      if (!data?.results?.length) break;
      const details = await mlGet(key, '/items', { ids: data.results.join(','), attributes: 'id,title' });
      if (Array.isArray(details)) {
        for (const entry of details) {
          const b = entry.body || {};
          if (b.title) existentes.push({ id: b.id, title: b.title, conta: key });
        }
      }
      offset += 100;
      if (offset >= (data.paging?.total || 0)) break;
    }
  }
  res.json(existentes);
});

module.exports = router;
