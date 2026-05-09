import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  const reload = () => api.audit(200).then(setRows);
  useEffect(() => { reload(); }, []);

  return (
    <div>
      <h1 className="page-title">Audit log</h1>
      <p className="page-sub">Authentication and admin actions, with IP and user-agent.</p>
      <div className="toolbar">
        <button className="btn" onClick={reload}>Refresh</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Target</th>
              <th>IP</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td><code className="inline">{r.action}</code></td>
                <td>{r.actorUserId ? `user#${r.actorUserId}` : r.actorApiKeyId ? `key#${r.actorApiKeyId}` : '—'}</td>
                <td>{r.targetType ? `${r.targetType}#${r.targetId}` : '—'}</td>
                <td><code className="inline">{r.ip ?? '—'}</code></td>
                <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <code className="inline" title={r.metadata ?? ''}>{r.metadata ?? '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No audit entries</div>}
      </div>
    </div>
  );
}
