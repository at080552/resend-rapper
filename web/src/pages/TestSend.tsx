import { useState } from 'react';
import { api } from '../api';

export default function TestSend() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Test from Resend Rapper');
  const [html, setHtml] = useState('<p>Hello from <strong>Resend Rapper</strong>.</p>');
  const [text, setText] = useState('Hello from Resend Rapper.');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const r = await api.testSend({
        from: from || undefined,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        html: html || undefined,
        text: text || undefined,
      });
      setMsg({ kind: 'ok', text: `Sent (#${r.id}, resend_id ${r.resend_id ?? '—'})` });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.body?.error ? `${e.body.error}: ${JSON.stringify(e.body)}` : e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Test send</h1>
      <p className="page-sub">Send an email through the same path your legacy clients will use.</p>

      {msg && <div className={`alert ${msg.kind === 'ok' ? 'success' : 'error'}`}>{msg.text}</div>}

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>From (optional — uses default if blank)</label>
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Acme &lt;noreply@acme.com&gt;" />
        </div>
        <div className="field">
          <label>To (comma separated)</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} required placeholder="alice@example.com, bob@example.com" />
        </div>
        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="field">
          <label>HTML</label>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} />
        </div>
        <div className="field">
          <label>Plain text</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </div>
  );
}
