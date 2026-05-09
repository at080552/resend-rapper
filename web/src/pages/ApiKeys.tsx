import { useEffect, useState } from 'react';
import { api } from '../api';

function parseDomains(s: string): string[] {
  return s.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export default function ApiKeys() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [issued, setIssued] = useState<{ name: string; plainKey: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => api.apiKeys().then(setRows);
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const k = await api.createApiKey(name.trim(), parseDomains(domains));
      setIssued({ name: k.name, plainKey: k.plainKey });
      setName('');
      setDomains('');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const updateDomains = async (id: number, current: string[]) => {
    const next = prompt('Allowed from-domains (comma separated). Leave blank to allow all.', current.join(', '));
    if (next === null) return;
    await api.updateApiKeyDomains(id, parseDomains(next));
    reload();
  };

  const revoke = async (id: number) => {
    if (!confirm('Revoke this API key? Existing clients will start receiving 401 errors.')) return;
    await api.revokeApiKey(id);
    reload();
  };

  return (
    <div>
      <h1 className="page-title">API keys</h1>
      <p className="page-sub">
        Issue keys for legacy clients. The plain value is shown only once at creation time.
        Restrict each key to specific from-domains to prevent spoofing.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Issue a new key</h2>
        <div className="field">
          <label>Key name</label>
          <input placeholder="e.g. rails2-prod" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Allowed from-domains (comma separated, optional)</label>
          <input placeholder="acme.com, mail.acme.com" value={domains} onChange={(e) => setDomains(e.target.value)} />
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            If empty, the global allowlist (Settings) applies.
          </p>
        </div>
        <button className="btn primary" onClick={create} disabled={busy}>Create key</button>
        {issued && (
          <div className="alert success" style={{ marginTop: 12 }}>
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
              <th>Allowed domains</th>
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
                <td>{(r.allowed_domains ?? []).join(', ') || <span style={{ color: '#94a3b8' }}>any (global)</span>}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.last_used_at ? new Date(r.last_used_at).toLocaleString() : '—'}</td>
                <td>
                  {r.revoked_at
                    ? <span className="badge failed">revoked</span>
                    : <span className="badge sent">active</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!r.revoked_at && (
                    <>
                      <button className="btn" onClick={() => updateDomains(r.id, r.allowed_domains ?? [])}>Domains</button>
                      {' '}
                      <button className="btn danger" onClick={() => revoke(r.id)}>Revoke</button>
                    </>
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
