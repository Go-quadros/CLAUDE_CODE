import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { logout as apiLogout } from '../api/client.js';

const NAV = [
  { path: '/',          label: 'Início',             icon: '🏠', section: 'Principal' },
  { path: '/pedidos',   label: 'Pedidos',             icon: '📦', section: 'Principal' },
  { path: '/simulador', label: 'Simulador de Preços', icon: '🧮', section: 'Ferramentas' },
  { path: '/relatorios',label: 'Relatórios',          icon: '📊', section: 'Ferramentas' },
  { path: '/ads',       label: 'Ads Gap',             icon: '🎯', section: 'Ferramentas' },
  { path: '/titulos',   label: 'Gerador de Títulos',  icon: '✏️', section: 'Ferramentas' },
];

const ADMIN_NAV = [
  { path: '/usuarios', label: 'Usuários', icon: '👥', section: 'Admin' },
];

export default function Layout() {
  const { name, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await apiLogout();
    logout();
    navigate('/login');
  };

  const navItems = role === 'master' ? [...NAV, ...ADMIN_NAV] : NAV;

  const sections = [...new Set(navItems.map(n => n.section))];

  const currentTitle = navItems.find(n =>
    n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path)
  )?.label || 'Dashboard';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>Go Quadros</h2>
          <span>Dashboard interno</span>
        </div>

        <nav className="sidebar-nav">
          {sections.map(section => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {navItems.filter(n => n.section === section).map(item => (
                <button
                  key={item.path}
                  className={`nav-item ${
                    (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
                      ? 'active' : ''
                  }`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <strong>{name || 'Usuário'}</strong>
          <br />
          <button
            onClick={handleLogout}
            style={{ color: '#6b7a9e', marginTop: 6, fontSize: 12, cursor: 'pointer', background: 'none', border: 'none' }}
          >
            Sair →
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <span className="topbar-title">{currentTitle}</span>
          <div className="topbar-actions">
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </span>
          </div>
        </div>
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
