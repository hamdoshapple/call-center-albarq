const API = '/api';

function token() {
  return localStorage.getItem('cc_token') || '';
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const pushNotificationsApi = {
  stats: () => request('/push/stats'),
  subscribers: (q = '', channel = 'push') => request(`/push/subscribers?${new URLSearchParams({ q, channel }).toString()}`),
  logs: (params: any = {}) => request(`/push/logs?${new URLSearchParams(params).toString()}`),
  settings: () => request('/push/settings'),
  saveSettings: (data: any) => request('/push/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  send: (data: any) => request('/push/send', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  runAuto: () => request('/push/auto/finance-events', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};
