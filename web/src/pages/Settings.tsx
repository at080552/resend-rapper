import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Settings() {
  const [s, setS] = useState<Awaited<ReturnType<typeof api.settings>> | null>(null);
  const [resendKey, setResendKey] = useState('');
  const [defaultFrom, setDefaultFrom] = useState('');
  const [retry, setRetry] = useState('3');
  const [maxBytes, setMaxBytes] = useState(String(5 * 1024 * 1024));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reload = async () => {
    const v = await api.settings();
    setS(v);
    setDefaultFrom(v.default_from);
    setRetry(v.retry_count);
    setMaxBytes(v.attachment_max_bytes);
  };
  useEffect(() => { reload(); }, []);

  const save = async () => {
    setMsg(null);
    try {
      await api.updateSettings({
        resend_api_key: resendKey || undefined,
        default_from: defaultFrom,
        retry_count: retry,
        attachment_max_bytes: maxBytes,
      });
      setResendKey('');
      setMsg({ kind: 'ok', text: 'Settings saved.' });
      reload();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    }
  };

  if (!s) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Configure the Resend connection and operational defaults.</p>

      {msg && <div className={`alert ${msg.kind === 'ok' ? 'success' : 'error'}`}>{msg.text}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Resend</h2>
        <div className="field">
          <label>Resend API key (encrypted at rest)</label>
          <input
            type="password"
            placeholder={s.resend_api_key_set ? '•••••• (saved — leave blank to keep)' : 're_xxxxxxxx'}
            value={resendKey}
            onChange={(e) => setResendKey(e.target.value)}
          />
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {s.resend_api_key_set ? 'A key is configured.' : 'No key configured yet — sends will fail until you set one.'}
          </p>
        </div>
        <div className="field">
          <label>Default From address</label>
          <input value={defaultFrom} onChange={(e) => setDefaultFrom(e.target.value)} placeholder="Acme &lt;noreply@acme.com&gt;" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Delivery</h2>
        <div className="field">
          <label>Max retry attempts (per send)</label>
          <input type="number" min={1} max={10} value={retry} onChange={(e) => setRetry(e.target.value)} />
        </div>
        <div className="field">
          <label>Attachment max size (bytes)</label>
          <input type="number" min={0} value={maxBytes} onChange={(e) => setMaxBytes(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn primary" onClick={save}>Save settings</button>
      </div>
    </div>
  );
}
