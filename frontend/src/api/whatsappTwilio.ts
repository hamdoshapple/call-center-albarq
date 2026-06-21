const API_BASE = '/api';

function token() {
  return localStorage.getItem('cc_token') || localStorage.getItem('token') || '';
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP_${res.status}`);
  }
  return res.json();
}

export const whatsappTwilioApi = {
  settings: () => request('/whatsapp-twilio/settings'),
  saveSettings: (data: any) => request('/whatsapp-twilio/settings', { method: 'PUT', body: JSON.stringify(data) }),
  conversations: () => request('/whatsapp-twilio/conversations'),
  messages: (id: string) => request(`/whatsapp-twilio/conversations/${id}/messages`),
  reply: (id: string, body: string, imageData?: string) => request(`/whatsapp-twilio/conversations/${id}/reply`, { method: 'POST', body: JSON.stringify({ body, imageData }) }),
  read: (id: string) => request(`/whatsapp-twilio/conversations/${id}/read`, { method: 'POST', body: JSON.stringify({}) }),
};
