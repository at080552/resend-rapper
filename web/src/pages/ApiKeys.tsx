import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ApiKeys() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{ name: string; plainKey: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => api.apiKeys().then(setRows);
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const k = await api.createApiKey(name.trim());
      setIssued({ name: k.name, plainKey: k.plainKey });
      setName('');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm('Revoke this API key? Existing clients will start receiving 401 errors.')) return;
    await api.revokeApiKey(id);
    reload();
  };

  return (
    <div>
      <h1 className="page-title">API keys</h1>
      <p className="page-sub">Issue keys for legacy clients. The plain value is shown only once at creation time.</p>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Issue a new key</h2>
        <div className="toolbar">
          <input placeholder="Key name (e.g. rails2-prod)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={create} disabled={busy}>Create key</button>
        </div>
        {issued && (
          <div className="alert success">
            <div><strong>{issued.name}</strong> created. Copy this now — it will not be shown again.</div>
            <div style={{ marginTop: 8 }}>
              <code className="inline" style={{ wordBreak: 'break-all', userSelect: 'all' }}>{issued.plainKey}</code>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><code className="inline">{r.prefix}…</code></td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.last_used_at ? new Date(r.last_used_at).toLocaleString() : '—'}</td>
                <td>
                  {r.revoked_at
                    ? <span className="badge failed">revoked</span>
                    : <span className="badge sent">active</span>}
                </td>
                <td>
                  {!r.revoked_at && (
                    <button className="btn danger" onClick={() => revoke(r.id)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No keys yet</div>}
      </div>
    </div>
  );
}
