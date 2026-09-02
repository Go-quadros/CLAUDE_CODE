import { useState } from 'react';
import { generateTitle } from '../api/client.js';

const TAMANHOS = ['30x45', '40x60', '50x70', '60x90'];
const TIPOS    = ['Moldura Caixinha', 'Moldura Filete', 'Sem Moldura'];
const TEMAS    = ['Abstrato', 'Floral', 'Minimalista', 'Paisagem', 'Família', 'Pets', 'Religioso', 'Infantil'];

export default function Titulos() {
  const [form, setForm] = useState({
    canal: 'ml',
    tamanho: '40x60',
    tipo: 'Moldura Caixinha',
    tema: 'Abstrato',
    descricao: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState('');
  const [copied, setCopied]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const gerar = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await generateTitle(form);
      setResult(data);
    } catch {
      setError('Erro ao gerar títulos.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
      {/* Formulário */}
      <div className="card">
        <div className="card-header"><span className="card-title">Gerador de Títulos</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Canal</label>
            <select className="form-input" value={form.canal} onChange={e => set('canal', e.target.value)}>
              <option value="ml">Mercado Livre</option>
              <option value="shopee">Shopee</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tamanho</label>
            <select className="form-input" value={form.tamanho} onChange={e => set('tamanho', e.target.value)}>
              {TAMANHOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tipo de produto</label>
            <select className="form-input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tema / estilo</label>
            <select className="form-input" value={form.tema} onChange={e => set('tema', e.target.value)}>
              {TEMAS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Palavras-chave extras (opcional)</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Ex: sala de jantar, tons neutros, estilo nórdico"
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={gerar}
            disabled={loading}
          >
            {loading ? 'Gerando…' : '✨ Gerar títulos'}
          </button>
        </div>
      </div>

      {/* Resultados */}
      <div>
        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Títulos gerados</span>
              <span className="badge badge-blue">{form.canal === 'ml' ? 'Mercado Livre' : 'Shopee'}</span>
            </div>
            <div className="card-body">
              {(result.titulos || []).map((t, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                  border: '1px solid #e2e8f0',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13.5, lineHeight: 1.4 }}>{t}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                      {t.length} caracteres
                      {form.canal === 'ml' && t.length > 60 &&
                        <span style={{ color: '#f59e0b' }}> (acima de 60 — verificar)</span>
                      }
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => copy(t, i)}
                  >
                    {copied === i ? '✓' : '📋'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="card">
            <div className="card-body" style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Preencha o formulário e clique em "Gerar títulos".
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
