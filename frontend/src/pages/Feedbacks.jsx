import { useState, useEffect, useCallback } from 'react';
import { getFeedbacks, createFeedback, updateFeedbackStatus, deleteFeedback } from '../api/client.js';

const CANAIS = [
  'ML Freewall', 'ML GQ Decoração', 'Shopee 1 (GQ)', 'Shopee 2 (Freewall)', 'TikTok Shop',
];

const MOTIVOS = [
  'Cor errada / diferente do anúncio',
  'Arte feia ou mal executada',
  'Baixa qualidade de impressão',
  'Tamanho incorreto',
  'Moldura com defeito',
  'Arte repetida / duplicada no catálogo',
  'Outro',
];

const EMPTY_FORM = { mlb: '', pedido_id: '', canal: '', motivo: '', descricao: '' };

function Badge({ status }) {
  return (
    <span className={`badge ${status === 'resolvido' ? 'badge-green' : 'badge-yellow'}`}>
      {status === 'resolvido' ? 'Resolvido' : 'Pendente'}
    </span>
  );
}

export default function Feedbacks() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [filtro, setFiltro]       = useState('todos');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  // Form state
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  };

  const load = useCallback(() => {
    setLoading(true);
    getFeedbacks(filtro !== 'todos' ? { status: filtro } : {})
      .then(d => setFeedbacks(d.feedbacks || []))
      .catch(() => flash('Erro ao carregar feedbacks.', true))
      .finally(() => setLoading(false));
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await createFeedback(form);
      if (d.ok) {
        flash('Feedback registrado com sucesso.');
        setForm(EMPTY_FORM);
        setShowForm(false);
        load();
      } else {
        flash(d.message || 'Erro ao salvar.', true);
      }
    } catch {
      flash('Erro ao salvar.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id, current) => {
    const next = current === 'pendente' ? 'resolvido' : 'pendente';
    try {
      const d = await updateFeedbackStatus(id, next);
      if (d.ok) {
        setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: next, resolved_at: d.feedback?.resolved_at } : f));
      }
    } catch {
      flash('Erro ao atualizar status.', true);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este feedback?')) return;
    try {
      await deleteFeedback(id);
      setFeedbacks(prev => prev.filter(f => f.id !== id));
      flash('Feedback excluído.');
    } catch {
      flash('Erro ao excluir.', true);
    }
  };

  const pendentes  = feedbacks.filter(f => f.status === 'pendente').length;
  const resolvidos = feedbacks.filter(f => f.status === 'resolvido').length;

  return (
    <div>
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total de feedbacks</div>
          <div className="kpi-value">{feedbacks.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pendentes</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{pendentes}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Resolvidos</div>
          <div className="kpi-value" style={{ color: '#22c55e' }}>{resolvidos}</div>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['todos', 'pendente', 'resolvido'].map(f => (
            <button
              key={f}
              className={`btn ${filtro === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setFiltro(f)}
            >
              {f === 'todos' ? 'Todos' : f === 'pendente' ? 'Pendentes' : 'Resolvidos'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Fechar' : '+ Novo feedback'}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Registrar feedback negativo</span></div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">ID do anúncio (MLB)</label>
                  <input
                    className="form-input"
                    value={form.mlb}
                    onChange={e => setForm({ ...form, mlb: e.target.value })}
                    placeholder="Ex: MLB4567890123"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Número do pedido</label>
                  <input
                    className="form-input"
                    value={form.pedido_id}
                    onChange={e => setForm({ ...form, pedido_id: e.target.value })}
                    placeholder="Ex: 2000012345678"
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Canal de venda</label>
                  <select
                    className="form-input"
                    value={form.canal}
                    onChange={e => setForm({ ...form, canal: e.target.value })}
                  >
                    <option value="">— selecione —</option>
                    {CANAIS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo da reclamação *</label>
                  <select
                    className="form-input"
                    value={form.motivo}
                    onChange={e => setForm({ ...form, motivo: e.target.value })}
                    required
                  >
                    <option value="">— selecione —</option>
                    {MOTIVOS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Descrição / observações</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.descricao}
                  onChange={e => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Descreva o feedback do cliente com detalhes..."
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Feedbacks registrados</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{feedbacks.length} resultado{feedbacks.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="loader">Carregando…</div>
        ) : feedbacks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
            Nenhum feedback registrado{filtro !== 'todos' ? ` com status "${filtro}"` : ''}.
          </div>
        ) : (
          <div>
            {feedbacks.map(f => (
              <div key={f.id} style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                {/* Status pill */}
                <div style={{ paddingTop: 2, flexShrink: 0 }}>
                  <Badge status={f.status} />
                </div>

                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{f.motivo}</span>
                    {f.canal && (
                      <span className="badge badge-blue">{f.canal}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginBottom: f.descricao ? 8 : 0, flexWrap: 'wrap' }}>
                    {f.mlb && <span>MLB: <strong style={{ color: '#3b4fd8' }}>{f.mlb}</strong></span>}
                    {f.pedido_id && <span>Pedido: <strong>{f.pedido_id}</strong></span>}
                    <span>Registrado em: {new Date(f.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {f.resolved_at && (
                      <span>Resolvido em: {new Date(f.resolved_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    )}
                  </div>

                  {f.descricao && (
                    <div style={{ fontSize: 13, color: '#374151', background: '#f8fafc', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid #e2e8f0' }}>
                      {f.descricao}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className={`btn btn-sm ${f.status === 'pendente' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleStatus(f.id, f.status)}
                    title={f.status === 'pendente' ? 'Marcar como resolvido' : 'Reabrir'}
                  >
                    {f.status === 'pendente' ? '✓ Resolver' : '↩ Reabrir'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDelete(f.id)}
                    title="Excluir"
                    style={{ color: '#ef4444' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
