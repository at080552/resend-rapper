import { useEffect, useState } from 'react';
import { api } from '../api';

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export default function Logs() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<any | null>(null);
  const [openAtt, setOpenAtt] = useState<any[]>([]);
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  const limit = 50;

  const reload = async () => {
    const res = await api.logs({ status: status || undefined, q: q || undefined, limit, offset });
    setRows(res.rows);
    setTotal(res.total);
  };

  useEffect(() => { reload(); }, [status, q, offset]);

  const openDetail = async (id: number) => {
    const detail = await api.log(id);
    setOpen(detail);
    setOpenAtt(detail.attachments || []);
  };

  const resend = async (id: number) => {
    setResentMsg(null);
    try {
      const r = await api.resend(id);
      setResentMsg(`Re-queued as #${r.id} (${r.status})`);
      reload();
    } catch (e: any) {
      setResentMsg(`Failed: ${e.message}`);
    }
  };

  return (
    <div>
      <h1 className="page-title">Logs</h1>
      <p className="page-sub">Every send attempt is recorded. Click a row to inspect or resend.</p>

      <div className="toolbar">
        <input placeholder="Search subject / from / to" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value); }} />
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}>
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <button className="btn" onClick={reload}>Refresh</button>
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 13 }}>
          {total} total
        </span>
      </div>

      {resentMsg && <div className="alert success">{resentMsg}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th style={{ width: 100 }}>Status</th>
              <th>Subject</th>
              <th>From</th>
              <th>To</th>
              <th style={{ width: 180 }}>Created</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r.id)}>
                <td>#{r.id}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.subject}</td>
                <td>{r.fromAddr}</td>
                <td>{(JSON.parse(r.toJson) as string[]).join(', ')}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn" onClick={() => resend(r.id)}>Resend</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No logs yet</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Prev</button>
        <button className="btn" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next →</button>
      </div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="h-flex">
              <h2 style={{ margin: 0 }}>#{open.id} <StatusBadge status={open.status} /></h2>
              <button className="btn" onClick={() => setOpen(null)}>Close</button>
            </div>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Created {new Date(open.createdAt).toLocaleString()}
              {open.sentAt && <> · Sent {new Date(open.sentAt).toLocaleString()}</>}
              · Attempts: {open.attempts}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 14 }}>
              <strong>Subject</strong><div>{open.subject}</div>
              <strong>From</strong><div>{open.fromAddr}</div>
              <strong>To</strong><div>{(JSON.parse(open.toJson) as string[]).join(', ')}</div>
              {open.ccJson && <><strong>Cc</strong><div>{(JSON.parse(open.ccJson) as string[]).join(', ')}</div></>}
              {open.bccJson && <><strong>Bcc</strong><div>{(JSON.parse(open.bccJson) as string[]).join(', ')}</div></>}
              {open.resendId && <><strong>Resend ID</strong><div><code className="inline">{open.resendId}</code></div></>}
              {open.errorMessage && <><strong>Error</strong><div style={{ color: 'var(--danger)' }}>{open.errorMessage}</div></>}
            </div>
            {openAtt.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Attachments</h3>
                <ul>
                  {openAtt.map((a: any) => (
                    <li key={a.id}>{a.filename} ({a.size_bytes} bytes)</li>
                  ))}
                </ul>
              </>
            )}
            {open.html && (
              <>
                <h3 style={{ marginTop: 16 }}>HTML preview</h3>
                <iframe className="preview-frame" sandbox="" srcDoc={open.html} />
              </>
            )}
            {open.textBody && (
              <>
                <h3 style={{ marginTop: 16 }}>Text</h3>
                <pre style={{ background: 'var(--soft)', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>{open.textBody}</pre>
              </>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => resend(open.id)}>Resend this email</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
