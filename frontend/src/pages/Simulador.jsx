import { useState } from 'react';

const CANAIS = [
  { key: 'ml_classico',   label: 'ML Clássico',    taxa: 0.16, frete_est: 0 },
  { key: 'ml_premium',    label: 'ML Premium',     taxa: 0.19, frete_est: 0 },
  { key: 'shopee',        label: 'Shopee',          taxa: 0.20, frete_est: 0 },
  { key: 'tiktok',        label: 'TikTok Shop',    taxa: 0.12, frete_est: 0 },
];

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

export default function Simulador() {
  const [preco, setPreco] = useState('');
  const [custo, setCusto]  = useState('');
  const [frete, setFrete]  = useState('');
  const [taxaExtra, setTaxaExtra] = useState('');
  const [results, setResults] = useState(null);

  const calcular = () => {
    const p  = parseFloat(preco)    || 0;
    const c  = parseFloat(custo)    || 0;
    const fr = parseFloat(frete)    || 0;
    const tx = parseFloat(taxaExtra) / 100 || 0;

    const res = CANAIS.map(canal => {
      const taxa_canal  = canal.taxa + tx;
      const desconto    = p * taxa_canal;
      const liquido     = p - desconto - fr;
      const margem      = liquido - c;
      const margem_pct  = p > 0 ? margem / p : 0;
      const markup      = c > 0 ? p / c : 0;
      return { ...canal, taxa_canal, desconto, liquido, margem, margem_pct, markup };
    });

    setResults({ preco: p, custo: c, frete: fr, rows: res });
  };

  const precoMinimo = (custo_v, frete_v, taxa) => {
    const c = parseFloat(custo_v) || 0;
    const f = parseFloat(frete_v) || 0;
    if (taxa >= 1) return 0;
    return (c + f) / (1 - taxa);
  };

  return (
    <div>
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Inputs */}
        <div className="card">
          <div className="card-header"><span className="card-title">Parâmetros</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Preço de venda (R$)</label>
              <input className="form-input" type="number" step="0.01" value={preco}
                onChange={e => setPreco(e.target.value)} placeholder="Ex: 89.90" />
            </div>
            <div className="form-group">
              <label className="form-label">Custo do produto (R$)</label>
              <input className="form-input" type="number" step="0.01" value={custo}
                onChange={e => setCusto(e.target.value)} placeholder="Ex: 28.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Custo de frete (R$)</label>
              <input className="form-input" type="number" step="0.01" value={frete}
                onChange={e => setFrete(e.target.value)} placeholder="Ex: 14.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Taxa extra (%)</label>
              <input className="form-input" type="number" step="0.1" value={taxaExtra}
                onChange={e => setTaxaExtra(e.target.value)} placeholder="Ex: 2 (anúncio)" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={calcular}>
              Calcular
            </button>
          </div>
        </div>

        {/* Preço mínimo por canal */}
        <div className="card">
          <div className="card-header"><span className="card-title">Preço mínimo (break-even)</span></div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Taxa</th>
                  <th>Preço mínimo</th>
                </tr>
              </thead>
              <tbody>
                {CANAIS.map(c => {
                  const taxa = c.taxa + (parseFloat(taxaExtra) / 100 || 0);
                  const pm   = precoMinimo(custo, frete, taxa);
                  return (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{pct(taxa)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(pm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Resultado */}
      {results && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <span className="card-title">Resultado por canal — venda a {fmt(results.preco)}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Taxa total</th>
                  <th>Desconto ML/plataforma</th>
                  <th>Líquido</th>
                  <th>Margem R$</th>
                  <th>Margem %</th>
                  <th>Markup</th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td>{pct(r.taxa_canal)}</td>
                    <td>{fmt(r.desconto)}</td>
                    <td>{fmt(r.liquido)}</td>
                    <td>
                      <span style={{ color: r.margem >= 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                        {fmt(r.margem)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.margem_pct >= 0.20 ? 'badge-green' : r.margem_pct >= 0.10 ? 'badge-yellow' : 'badge-red'}`}>
                        {pct(r.margem_pct)}
                      </span>
                    </td>
                    <td>{r.markup.toFixed(2)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
