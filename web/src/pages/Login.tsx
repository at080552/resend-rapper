import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: (u: { id: number; username: string }) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const u = await api.login(username, password);
      onLogin(u);
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 24 }}>
          <div className="brand-mark">RR</div>
          <div>Resend Rapper</div>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Sign in</h1>
        <p style={{ color: '#6b7280', marginTop: 0, fontSize: 14 }}>
          Use the admin account created with <code className="inline">npm run create-admin</code>.
        </p>
        {err && <div className="alert error" style={{ marginTop: 12 }}>{err}</div>}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
