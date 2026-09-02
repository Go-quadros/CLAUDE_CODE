import { useState, useEffect } from 'react';
import { collectSales, saveManual, getManual } from '../api/client.js';

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Tab: Projeções ─────────────────────────────────────────────────────────
function Projecoes() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const toISO = d => d.toISOString().split('T')[0];

  const [dateFrom] = useState(toISO(firstDay));
  const [dateTo]   = useState(toISO(today));
  const [fw, setFw] = useState(null);
  const [gq, setGq] = useState(null);
  const [loading, setLoading] = useState(true);

  const daysTotal = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysPassed = today.getDate();

  useEffect(() => {
    Promise.all([
      collectSales({ account: 'freewall', date_from: dateFrom, date_to: dateTo }),
      collectSales({ account: 'nova_gq',  date_from: dateFrom, date_to: dateTo }),
    ])
      .then(([a, b]) => { setFw(a); setGq(b); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader">Carregando…</div>;

  const totalAtual = (fw?.total || 0) + (gq?.total || 0);
  const projetado  = daysPassed > 0 ? (totalAtual / daysPassed) * daysTotal : 0;
  const mediadiaria = daysPassed > 0 ? totalAtual / daysPassed : 0;

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Acumulado do mês</div>
          <div className="kpi-value">{fmt(totalAtual)}</div>
          <div className="kpi-sub">{daysPassed}º dia de {daysTotal}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Projeção fim do mês</div>
          <div className="kpi-value" style={{ color: '#3b4fd8' }}>{fmt(projetado)}</div>
          <div className="kpi-sub">baseada na média diária</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Média diária</div>
          <div className="kpi-value">{fmt(mediadiaria)}</div>
          <div className="kpi-sub">{daysTotal - daysPassed} dias restantes</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="kpi-card">
          <div className="kpi-label">Freewall Decoração</div>
          <div className="kpi-value">{fmt(fw?.total)}</div>
          <div className="kpi-sub">{fw?.orders || 0} pedidos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">GQ Decoração</div>
          <div className="kpi-value">{fmt(gq?.total)}</div>
          <div className="kpi-sub">{gq?.orders || 0} pedidos</div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Comparativo ──────────────────────────────────────────────────────
function Comparativo() {
  const today = new Date();
  const toISO = d => d.toISOString().split('T')[0];

  const monthStart = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return toISO(d);
  };
  const monthEnd = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    return toISO(d);
  };

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const months = [
      { label: toISO(new Date(today.getFullYear(), today.getMonth() - 2, 1)).slice(0, 7), from: monthStart(-2), to: monthEnd(-2) },
      { label: toISO(new Date(today.getFullYear(), today.getMonth() - 1, 1)).slice(0, 7), from: monthStart(-1), to: monthEnd(-1) },
      { label: toISO(new Date(today.getFullYear(), today.getMonth(),     1)).slice(0, 7), from: monthStart(0),  to: toISO(today) },
    ];

    Promise.all(months.map(m =>
      Promise.all([
        collectSales({ account: 'freewall', date_from: m.from, date_to: m.to }),
        collectSales({ account: 'nova_gq',  date_from: m.from, date_to: m.to }),
      ]).then(([fw, gq]) => ({
        label: m.label,
        freewall: fw.total || 0,
        nova_gq: gq.total || 0,
        total: (fw.total || 0) + (gq.total || 0),
        orders: (fw.orders || 0) + (gq.orders || 0),
      }))
    ))
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader">Carregando…</div>;

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Comparativo últimos 3 meses</span></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Freewall</th>
              <th>GQ Decoração</th>
              <th>Total ML</th>
              <th>Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td>{fmt(r.freewall)}</td>
                <td>{fmt(r.nova_gq)}</td>
                <td style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
                <td>{r.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Fechamento Mensal ────────────────────────────────────────────────
const CANAIS_FECH = [
  { id: 'shopee1',  label: 'Shopee 1',       sublabel: 'GQ Decoração',      cor: '#EE4D2D' },
  { id: 'shopee2',  label: 'Shopee 2',       sublabel: 'Freewall Decoração', cor: '#EE4D2D' },
  { id: 'ml1',      label: 'ML 1',           sublabel: 'Freewall Decoração', cor: '#FFBF00' },
  { id: 'ml2',      label: 'ML 2',           sublabel: 'GQ Decoração',       cor: '#FFBF00' },
  { id: 'tiktok',   label: 'TikTok Shop',    sublabel: '',                   cor: '#111' },
];

function FechamentoMensal() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [vals, setVals] = useState(() =>
    Object.fromEntries(CANAIS_FECH.map(c => [c.id, { bruto: '', liquido: '', investimento: '' }]))
  );
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const setVal = (id, field, v) =>
    setVals(prev => ({ ...prev, [id]: { ...prev[id], [field]: v } }));

  const gerar = () => {
    const rows = CANAIS_FECH.map(c => {
      const { bruto, liquido, investimento } = vals[c.id];
      const b = parseFloat(bruto) || 0;
      const l = parseFloat(liquido) || 0;
      const inv = parseFloat(investimento) || 0;
      const dif = b > 0 ? ((b - l) / b * 100).toFixed(1) : 0;
      const roas = inv > 0 ? (l / inv).toFixed(2) : '—';
      const acos = l > 0 ? (inv / l * 100).toFixed(1) : '—';
      return { ...c, b, l, inv, dif, roas, acos };
    });
    const totalBruto = rows.reduce((s, r) => s + r.b, 0);
    const totalLiq   = rows.reduce((s, r) => s + r.l, 0);
    const totalInv   = rows.reduce((s, r) => s + r.inv, 0);
    setPreview({ rows, totalBruto, totalLiq, totalInv });
  };

  const imprimir = () => window.print();

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Fechamento — {mes}</span>
          <input
            type="month"
            className="form-input"
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Bruto (R$)</th>
                  <th>Líquido (R$)</th>
                  <th>Investimento Ads (R$)</th>
                </tr>
              </thead>
              <tbody>
                {CANAIS_FECH.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: c.cor }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{c.sublabel}</div>
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.01" style={{ width: 140 }}
                        value={vals[c.id].bruto} onChange={e => setVal(c.id, 'bruto', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.01" style={{ width: 140 }}
                        value={vals[c.id].liquido} onChange={e => setVal(c.id, 'liquido', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.01" style={{ width: 140 }}
                        value={vals[c.id].investimento} onChange={e => setVal(c.id, 'investimento', e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={gerar}>Gerar preview</button>
            {preview && (
              <button className="btn btn-secondary" onClick={imprimir}>🖨️ Imprimir PDF</button>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div className="card" id="fechamento-preview">
          <div className="card-header">
            <span className="card-title">Resumo — {mes}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {preview.rows.map(r => (
                <div key={r.id} style={{
                  border: `2px solid ${r.cor}`,
                  borderRadius: 10,
                  padding: '14px 18px',
                  minWidth: 180,
                  flex: '1 1 180px',
                }}>
                  <div style={{ fontWeight: 700, color: r.cor }}>{r.label}</div>
                  {r.sublabel && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{r.sublabel}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    <div><span style={{ color: '#6b7280' }}>Bruto:</span> <strong>{fmt(r.b)}</strong></div>
                    <div><span style={{ color: '#6b7280' }}>Líquido:</span> <strong>{fmt(r.l)}</strong></div>
                    <div><span style={{ color: '#6b7280' }}>Dif:</span> <strong>{r.dif}%</strong></div>
                    {r.inv > 0 && <>
                      <div><span style={{ color: '#6b7280' }}>ROAS:</span> <strong>{r.roas}x</strong></div>
                      <div><span style={{ color: '#6b7280' }}>ACOS:</span> <strong>{r.acos}%</strong></div>
                    </>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Total Bruto</div>
                <div className="kpi-value">{fmt(preview.totalBruto)}</div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Total Líquido</div>
                <div className="kpi-value">{fmt(preview.totalLiq)}</div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Total Investimento</div>
                <div className="kpi-value">{fmt(preview.totalInv)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'projecoes',  label: 'Projeções' },
  { key: 'comparativo', label: 'Comparativo' },
  { key: 'fechamento', label: 'Fechamento Mensal' },
];

export default function Relatorios() {
  const [tab, setTab] = useState('projecoes');

  return (
    <div>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'projecoes'   && <Projecoes />}
      {tab === 'comparativo' && <Comparativo />}
      {tab === 'fechamento'  && <FechamentoMensal />}
    </div>
  );
}
