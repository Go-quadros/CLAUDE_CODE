import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectSales, getAccounts } from '../api/client.js';
import { useAuth } from '../App.jsx';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Home() {
  const { name, role } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const toISO = d => d.toISOString().split('T')[0];

  useEffect(() => {
    getAccounts().then(d => setAccounts(d.accounts || [])).catch(() => {});

    const dateFrom = toISO(firstOfMonth);
    const dateTo = toISO(today);

    Promise.all([
      collectSales({ account: 'freewall', date_from: dateFrom, date_to: dateTo }),
      collectSales({ account: 'nova_gq',  date_from: dateFrom, date_to: dateTo }),
    ])
      .then(([fw, gq]) => {
        setSales({
          freewall: fw.total || 0,
          nova_gq: gq.total || 0,
          total: (fw.total || 0) + (gq.total || 0),
          orders: (fw.orders || 0) + (gq.orders || 0),
        });
      })
      .catch(() => setSales(null))
      .finally(() => setLoadingSales(false));
  }, []);

  const shortcuts = [
    { label: 'Ver Pedidos', icon: '📦', path: '/pedidos' },
    { label: 'Simulador de Preços', icon: '🧮', path: '/simulador' },
    { label: 'Relatórios', icon: '📊', path: '/relatorios' },
    { label: 'Ads Gap', icon: '🎯', path: '/ads' },
    { label: 'Títulos', icon: '✏️', path: '/titulos' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>
          Olá, {name?.split(' ')[0] || 'usuário'} 👋
        </h2>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
          {today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPIs do mês */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Faturamento do mês</div>
          <div className="kpi-value" style={{ color: '#1a1f36' }}>
            {loadingSales ? '…' : fmt(sales?.total)}
          </div>
          <div className="kpi-sub">Freewall + GQ (ML)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pedidos no mês</div>
          <div className="kpi-value">{loadingSales ? '…' : (sales?.orders || 0)}</div>
          <div className="kpi-sub">ambas as contas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Freewall Decoração</div>
          <div className="kpi-value">{loadingSales ? '…' : fmt(sales?.freewall)}</div>
          <div className="kpi-sub">ML — mês atual</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">GQ Decoração</div>
          <div className="kpi-value">{loadingSales ? '…' : fmt(sales?.nova_gq)}</div>
          <div className="kpi-sub">ML — mês atual</div>
        </div>
      </div>

      {/* Status contas ML */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Contas Mercado Livre</span>
        </div>
        <div className="card-body">
          {accounts.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>Nenhuma conta conectada.</p>
          ) : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {accounts.map(acc => (
                <div key={acc.key} style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '12px 16px',
                  minWidth: 200,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{acc.name || acc.key}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {acc.nickname || '—'}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${acc.connected ? 'badge-green' : 'badge-red'}`}>
                      {acc.connected ? 'Conectada' : 'Desconectada'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Atalhos */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Atalhos</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {shortcuts.map(s => (
              <button
                key={s.path}
                className="btn btn-secondary"
                onClick={() => navigate(s.path)}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
