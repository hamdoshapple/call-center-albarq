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
  previewCampaign: async (payload: any) => request('/push/campaign-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  confirmCampaign: async (payload: any) => request('/push/campaign-confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  send: (data: any) => request('/push/send', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  campaignJobs: () => request('/push/campaign-jobs'),
  campaignJob: (id: string) => request(`/push/campaign-jobs/${encodeURIComponent(id)}`),
  cancelCampaignJob: (id: string) => request(`/push/campaign-jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  pauseCampaignJob: (id: string) => request(`/push/campaign-jobs/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  resumeCampaignJob: (id: string) => request(`/push/campaign-jobs/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  runAuto: () => request('/push/auto/finance-events', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  twilioTemplates: () => request('/push/twilio-templates'),
  syncTwilioTemplates: () => request('/push/twilio-templates/sync', { method: 'POST', body: JSON.stringify({}) }),
  saveTwilioTemplates: (templates: any[]) => request('/push/twilio-templates', {
    method: 'PUT',
    body: JSON.stringify({ templates }),
  }),
  sendTwilioTemplate: (data: any) => request('/push/send-twilio-template', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
