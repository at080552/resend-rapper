import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const WINDOWS = [
  { label: '24h', value: 24 },
  { label: '7d', value: 24 * 7 },
  { label: '30d', value: 24 * 30 },
];

export default function Dashboard() {
  const [win, setWin] = useState(24);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.metrics>> | null>(null);

  useEffect(() => {
    api.metrics(win).then(setData).catch(() => setData(null));
  }, [win]);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Overview of recent email traffic.</p>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              className={`btn${w.value === win ? ' primary' : ''}`}
              onClick={() => setWin(w.value)}
            >
              Last {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row cols-4">
        <div className="card metric">
          <div className="lbl">Sent</div>
          <div className="num" style={{ color: 'var(--success)' }}>{data?.sent ?? '—'}</div>
        </div>
        <div className="card metric">
          <div className="lbl">Failed</div>
          <div className="num" style={{ color: 'var(--danger)' }}>{data?.failed ?? '—'}</div>
        </div>
        <div className="card metric">
          <div className="lbl">Pending</div>
          <div className="num" style={{ color: 'var(--warn)' }}>{data?.pending ?? '—'}</div>
        </div>
        <div className="card metric">
          <div className="lbl">Success rate</div>
          <div className="num">{data ? `${(data.successRate * 100).toFixed(1)}%` : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Sent vs Failed</h2>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={data?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="bucket" tickFormatter={(v) => new Date(v).toLocaleString()} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="sent" stroke="#16a34a" fill="#bbf7d0" />
              <Area type="monotone" dataKey="failed" stroke="#dc2626" fill="#fecaca" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="lbl">Lifetime sent (all time)</div>
        <div className="num">{data?.lifetime ?? '—'}</div>
      </div>
    </div>
  );
}
