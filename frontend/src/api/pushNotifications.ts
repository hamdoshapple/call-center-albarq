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
  send: (data: any) => request('/push/send', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
