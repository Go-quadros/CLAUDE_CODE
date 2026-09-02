import { useState, useEffect } from 'react';
import { getUsers, createUser, deleteUser, changePassword, renameUser } from '../api/client.js';

export default function Usuarios() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Create form
  const [newUser, setNewUser]   = useState({ username: '', password: '', role: 'viewer', name: '' });
  const [creating, setCreating] = useState(false);

  // Password change
  const [pwTarget, setPwTarget] = useState('');
  const [newPw, setNewPw]       = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    getUsers()
      .then(d => setUsers(d.users || []))
      .catch(() => setError('Erro ao carregar usuários.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const d = await createUser(newUser);
      if (d.ok) {
        flash(`Usuário "${newUser.username}" criado.`);
        setNewUser({ username: '', password: '', role: 'viewer', name: '' });
        loadUsers();
      } else {
        flash(d.message || 'Erro ao criar usuário.', true);
      }
    } catch {
      flash('Erro ao criar usuário.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Excluir usuário "${username}"?`)) return;
    try {
      const d = await deleteUser(username);
      if (d.ok) { flash(`Usuário "${username}" excluído.`); loadUsers(); }
      else flash(d.message || 'Erro.', true);
    } catch {
      flash('Erro ao excluir.', true);
    }
  };

  const handleChangePw = async (e) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      const d = await changePassword(pwTarget, { password: newPw });
      if (d.ok) {
        flash(`Senha de "${pwTarget}" atualizada.`);
        setPwTarget(''); setNewPw('');
      } else flash(d.message || 'Erro.', true);
    } catch {
      flash('Erro ao alterar senha.', true);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div>
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="grid-2" style={{ gap: 20, alignItems: 'start', marginBottom: 20 }}>
        {/* Criar usuário */}
        <div className="card">
          <div className="card-header"><span className="card-title">Novo usuário</span></div>
          <div className="card-body">
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nome completo</label>
                <input className="form-input" value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Ex: João Silva" />
              </div>
              <div className="form-group">
                <label className="form-label">Usuário</label>
                <input className="form-input" value={newUser.username} required
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Ex: joao" />
              </div>
              <div className="form-group">
                <label className="form-label">Senha</label>
                <input className="form-input" type="password" value={newUser.password} required
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="form-group">
                <label className="form-label">Nível</label>
                <select className="form-input" value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="viewer">Visualizador</option>
                  <option value="editor">Editor</option>
                  <option value="master">Master</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={creating}
                style={{ width: '100%', justifyContent: 'center' }}>
                {creating ? 'Criando…' : 'Criar usuário'}
              </button>
            </form>
          </div>
        </div>

        {/* Alterar senha */}
        <div className="card">
          <div className="card-header"><span className="card-title">Alterar senha</span></div>
          <div className="card-body">
            <form onSubmit={handleChangePw}>
              <div className="form-group">
                <label className="form-label">Usuário</label>
                <select className="form-input" value={pwTarget}
                  onChange={e => setPwTarget(e.target.value)} required>
                  <option value="">— selecione —</option>
                  {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nova senha</label>
                <input className="form-input" type="password" value={newPw} required
                  onChange={e => setNewPw(e.target.value)} placeholder="Nova senha" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={savingPw || !pwTarget}
                style={{ width: '100%', justifyContent: 'center' }}>
                {savingPw ? 'Salvando…' : 'Alterar senha'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Lista de usuários */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Usuários cadastrados</span>
          <button className="btn btn-secondary btn-sm" onClick={loadUsers}>↺ Atualizar</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Nome</th>
                <th>Nível</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280' }}>Carregando…</td></tr>
              ) : users.map(u => (
                <tr key={u.username}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.username}</td>
                  <td>{u.name || '—'}</td>
                  <td>
                    <span className={`badge ${u.role === 'master' ? 'badge-blue' : u.role === 'editor' ? 'badge-yellow' : 'badge-gray'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.username !== 'admin' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u.username)}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
