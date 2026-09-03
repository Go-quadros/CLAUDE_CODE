import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { getMe } from './api/client.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Pedidos from './pages/Pedidos.jsx';
import Simulador from './pages/Simulador.jsx';
import Relatorios from './pages/Relatorios.jsx';
import AdsGap from './pages/AdsGap.jsx';
import Titulos from './pages/Titulos.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Feedbacks from './pages/Feedbacks.jsx';

export const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function MasterOnly({ children }) {
  const { role } = useAuth();
  if (role !== 'master') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [name, setName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(d => {
        if (d.user) { setUser(d.user); setRole(d.role); setName(d.name); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = ({ user, role, name }) => { setUser(user); setRole(role); setName(name); };
  const logout = () => { setUser(null); setRole(null); setName(null); };

  return (
    <AuthCtx.Provider value={{ user, role, name, loading, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Home />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="simulador" element={<Simulador />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="ads" element={<AdsGap />} />
            <Route path="titulos" element={<Titulos />} />
            <Route path="feedbacks" element={<Feedbacks />} />
            <Route path="usuarios" element={<MasterOnly><Usuarios /></MasterOnly>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
