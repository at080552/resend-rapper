import { useState } from 'react';
import { api } from '../api';

export default function Account({ username }: { username: string }) {
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [unameCur, setUnameCur] = useState('');
  const [uname, setUname] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pwNew.length < 8) return setMsg({ kind: 'err', text: 'New password must be ≥ 8 characters.' });
    if (pwNew !== pwConfirm) return setMsg({ kind: 'err', text: 'Confirmation does not match.' });
    try {
      await api.changePassword(pwCur, pwNew);
      setMsg({ kind: 'ok', text: 'Password changed. You will be signed out.' });
      setPwCur(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => { window.location.href = '/admin/login'; }, 1200);
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message || 'Failed to change password.' });
    }
  };

  const changeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!uname.trim()) return setMsg({ kind: 'err', text: 'Username is required.' });
    try {
      await api.changeUsername(unameCur, uname.trim());
      setMsg({ kind: 'ok', text: 'Username updated. Sign in again with the new name.' });
      setUnameCur(''); setUname('');
      setTimeout(() => { window.location.href = '/admin/login'; }, 1200);
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message || 'Failed to change username.' });
    }
  };

  return (
    <div>
      <h1 className="page-title">Account</h1>
      <p className="page-sub">Signed in as <strong>{username}</strong>.</p>

      {msg && <div className={`alert ${msg.kind === 'ok' ? 'success' : 'error'}`}>{msg.text}</div>}

      <form className="card" onSubmit={changePassword}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Change password</h2>
        <div className="field">
          <label>Current password</label>
          <input type="password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} required />
        </div>
        <div className="field">
          <label>New password (≥ 8 chars)</label>
          <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
        </div>
        <button className="btn primary">Update password</button>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
          On success, all existing sessions (including this one) are invalidated.
        </p>
      </form>

      <form className="card" style={{ marginTop: 20 }} onSubmit={changeUsername}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Change username</h2>
        <div className="field">
          <label>Current password</label>
          <input type="password" value={unameCur} onChange={(e) => setUnameCur(e.target.value)} required />
        </div>
        <div className="field">
          <label>New username</label>
          <input value={uname} onChange={(e) => setUname(e.target.value)} required />
        </div>
        <button className="btn">Update username</button>
      </form>
    </div>
  );
}
