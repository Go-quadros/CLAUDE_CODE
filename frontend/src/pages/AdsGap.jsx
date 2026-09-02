import { useState, useEffect } from 'react';
import { getAdsGap } from '../api/client.js';

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdsGap() {
  const [account, setAccount] = useState('freewall');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = async (acc) => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const d = await getAdsGap(acc);
      setData(d);
    } catch {
      setError('Erro ao buscar dados de ads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(account); }, [account]);

  const items = data?.items || [];
  const gap   = items.filter(i => i.no_ads);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Conta</label>
            <select
              className="form-input"
              value={account}
              onChange={e => setAccount(e.target.value)}
              style={{ width: 220 }}
            >
              <option value="freewall">Freewall Decoração</option>
              <option value="nova_gq">GQ Decoração</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => load(account)} disabled={loading}>
            ↺ Atualizar
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && <div className="loader">Carregando dados de anúncios…</div>}

      {data && !loading && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-label">Total de itens com venda</div>
              <div className="kpi-value">{items.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Sem anúncio (gap)</div>
              <div className="kpi-value" style={{ color: '#ef4444' }}>{gap.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Com anúncio</div>
              <div className="kpi-value" style={{ color: '#22c55e' }}>{items.length - gap.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cobertura</div>
              <div className="kpi-value">
                {items.length > 0 ? `${(((items.length - gap.length) / items.length) * 100).toFixed(0)}%` : '—'}
              </div>
            </div>
          </div>

          {gap.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Itens sem anúncio ({gap.length})</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>MLB</th>
                      <th>Título</th>
                      <th>Vendas 30d</th>
                      <th>Preço</th>
                      <th>Ver no ML</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gap.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.id}</td>
                        <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </td>
                        <td style={{ fontWeight: 600 }}>{item.sold_qty || 0}</td>
                        <td>{fmt(item.price)}</td>
                        <td>
                          <a
                            href={`https://www.mercadolivre.com.br/anuncios/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {gap.length === 0 && (
            <div className="alert alert-success">
              Todos os itens com vendas já possuem anúncio ativo. 🎉
            </div>
          )}
        </>
      )}
    </div>
  );
}
