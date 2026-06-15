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

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || 'Request failed');
  }

  return res.json();
}

export const adminTicketsApi = {
  departments: () => request('/admin-ticket-departments'),

  searchSubscribers: (q: string) =>
    request(`/admin-ticket-subscribers?q=${encodeURIComponent(q)}`),

  list: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    return request(`/admin-tickets${q.toString() ? `?${q}` : ''}`);
  },

  get: (id: string) => request(`/admin-tickets/${id}`),

  create: (data: any) =>
    request('/admin-tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: any) =>
    request(`/admin-tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  reply: (id: string, data: any) =>
    request(`/admin-tickets/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  upload: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
