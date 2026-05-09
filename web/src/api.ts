async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status, body });
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => call<{ id: number; username: string }>('/admin/api/me'),
  login: (username: string, password: string) =>
    call<{ id: number; username: string }>('/admin/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => call<{ ok: true }>('/admin/api/logout', { method: 'POST' }),
  metrics: (windowHours: number) =>
    call<{
      windowHours: number; total: number; sent: number; failed: number; pending: number;
      successRate: number; series: { bucket: string; sent: number; failed: number }[]; lifetime: number;
    }>(`/admin/api/metrics?window=${windowHours}`),
  logs: (params: { status?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.q) qs.set('q', params.q);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return call<{ rows: any[]; total: number; limit: number; offset: number }>(`/admin/api/logs?${qs}`);
  },
  log: (id: number) => call<any>(`/admin/api/logs/${id}`),
  resend: (id: number) => call<any>(`/admin/api/logs/${id}/resend`, { method: 'POST' }),
  testSend: (payload: any) =>
    call<any>('/admin/api/test-send', { method: 'POST', body: JSON.stringify(payload) }),
  apiKeys: () => call<any[]>('/admin/api/api-keys'),
  createApiKey: (name: string, allowed_domains: string[]) =>
    call<{ id: number; name: string; prefix: string; plainKey: string }>('/admin/api/api-keys', {
      method: 'POST', body: JSON.stringify({ name, allowed_domains }),
    }),
  updateApiKeyDomains: (id: number, allowed_domains: string[]) =>
    call<{ ok: true }>(`/admin/api/api-keys/${id}`, {
      method: 'PUT', body: JSON.stringify({ allowed_domains }),
    }),
  revokeApiKey: (id: number) => call<{ ok: true }>(`/admin/api/api-keys/${id}/revoke`, { method: 'POST' }),
  settings: () =>
    call<{
      resend_api_key_set: boolean;
      default_from: string;
      default_reply_to: string;
      retry_count: string;
      attachment_max_bytes: string;
      allowed_from_domains: string;
      log_retention_days: string;
      rate_limit_per_key_per_min: string;
    }>('/admin/api/settings'),
  updateSettings: (
    s: Partial<{
      resend_api_key: string;
      default_from: string;
      default_reply_to: string;
      retry_count: string;
      attachment_max_bytes: string;
      allowed_from_domains: string;
      log_retention_days: string;
      rate_limit_per_key_per_min: string;
    }>,
  ) => call<{ ok: true }>('/admin/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  audit: (limit = 100) => call<any[]>(`/admin/api/audit?limit=${limit}`),
};
