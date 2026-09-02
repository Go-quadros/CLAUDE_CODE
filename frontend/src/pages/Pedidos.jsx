import { useState } from 'react';
import { getOrders } from '../api/client.js';

const STATUS_LABELS = {
  paid: 'Pago', shipped: 'Enviado', delivered: 'Entregue',
  cancelled: 'Cancelado', pending: 'Pendente',
};

const BADGE_MAP = {
  paid: 'badge-blue', shipped: 'badge-yellow', delivered: 'badge-green',
  cancelled: 'badge-red', pending: 'badge-gray',
};

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Pedidos() {
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({ account: 'freewall', date_from: today, date_to: today });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOrders(filters);
      setOrders(data.orders || []);
      setSearched(true);
    } catch {
      setError('Erro ao buscar pedidos.');
    } finally {
      setLoading(false);
    }
  };

  const totalBruto = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalLiq   = orders.reduce((s, o) => s + (o.valor_liquido || 0), 0);

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Conta</label>
            <select
              className="form-input"
              value={filters.account}
              onChange={e => setFilters({ ...filters, account: e.target.value })}
              style={{ width: 200 }}
            >
              <option value="freewall">Freewall Decoração</option>
              <option value="nova_gq">GQ Decoração</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">De</label>
            <input
              className="form-input"
              type="date"
              value={filters.date_from}
              onChange={e => setFilters({ ...filters, date_from: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Até</label>
            <input
              className="form-input"
              type="date"
              value={filters.date_to}
              onChange={e => setFilters({ ...filters, date_to: e.target.value })}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {searched && (
        <>
          {/* Totais */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-label">Pedidos</div>
              <div className="kpi-value">{orders.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total bruto</div>
              <div className="kpi-value">{fmt(totalBruto)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total líquido</div>
              <div className="kpi-value">{fmt(totalLiq)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ticket médio</div>
              <div className="kpi-value">{orders.length ? fmt(totalBruto / orders.length) : '—'}</div>
            </div>
          </div>

          {/* Tabela */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pedidos</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{orders.length} resultados</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Data</th>
                    <th>Status</th>
                    <th>Produto</th>
                    <th>Cor</th>
                    <th>Tamanho</th>
                    <th>Qtd</th>
                    <th>Bruto</th>
                    <th>Líquido</th>
                    <th>Envio até</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: '#6b7280' }}>Nenhum pedido.</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id}>
                      <td>
                        <a
                          href={`https://www.mercadolivre.com.br/vendas/${o.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#3b4fd8' }}
                        >
                          #{o.id}
                        </a>
                      </td>
                      <td>{o.date_created ? new Date(o.date_created).toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <span className={`badge ${BADGE_MAP[o.status] || 'badge-gray'}`}>
                          {STATUS_LABELS[o.status] || o.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {o.titulo_item || '—'}
                      </td>
                      <td>{o.cor || '—'}</td>
                      <td>{o.tamanho || '—'}</td>
                      <td>{o.quantity}</td>
                      <td>{fmt(o.total_amount)}</td>
                      <td>{fmt(o.valor_liquido)}</td>
                      <td>{o.ship_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
