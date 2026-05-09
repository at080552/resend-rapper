import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import ApiKeys from './pages/ApiKeys';
import Settings from './pages/Settings';
import TestSend from './pages/TestSend';

export default function App() {
  const [me, setMe] = useState<{ id: number; username: string } | null | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) {
    return <div style={{ padding: 40, color: '#6b7280' }}>Loading…</div>;
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={(u) => { setMe(u); navigate('/'); }} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const logout = async () => {
    await api.logout();
    setMe(null);
    navigate('/login');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RR</div>
          <div>Resend Rapper</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/logs">Logs</NavLink>
          <NavLink to="/api-keys">API Keys</NavLink>
          <NavLink to="/test-send">Test Send</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid var(--border)', color: '#6b7280', fontSize: 13 }}>
          Signed in as <strong>{me.username}</strong>
          <button className="btn" style={{ marginTop: 8, width: '100%' }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/test-send" element={<TestSend />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
