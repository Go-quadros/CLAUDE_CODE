import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin } from '../api/client.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(form);
      if (data.ok) {
        login({ user: data.user, role: data.role, name: data.name });
        navigate('/');
      } else {
        setError(data.message || 'Usuário ou senha incorretos.');
      }
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1f36 0%, #2d3a6b 100%)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>Go Quadros</h1>
          <p style={{ color: '#a8b2d8', fontSize: 13, marginTop: 6 }}>Dashboard interno</p>
        </div>

        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Entrar</h2>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Usuário</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Senha</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 6, padding: '10px' }}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
