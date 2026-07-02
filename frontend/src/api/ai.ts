const API_BASE = '/api';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}`,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }

  return data.data as T;
}

export type AiSettings = {
  id: number;
  enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  contextSize: number;
  maxTokens: number;
  timeoutMs: number;
  streaming: boolean;
  threads: number;
  gpuLayers: number;
  memoryMb: number;
  keepAlive: string;
};

export type AiStatusResponse = {
  settings: AiSettings;
  summary: {
    providers: number;
    models: number;
    prompts: number;
    skills: number;
    tools: number;
  };
};

export async function getAiStatus(): Promise<AiStatusResponse> {
  return request<AiStatusResponse>('/ai/status');
}

export async function bootstrapAi(): Promise<{ message: string }> {
  return request<{ message: string }>('/ai/bootstrap', { method: 'POST' });
}

export async function syncOllamaModels(): Promise<any[]> {
  return request<any[]>('/ai/models/sync-ollama', { method: 'POST' });
}

export async function getAiPrompts(): Promise<any[]> {
  return request<any[]>('/ai/prompts');
}

export async function getAiSkills(): Promise<any[]> {
  return request<any[]>('/ai/skills');
}

export async function getAiTools(): Promise<any[]> {
  return request<any[]>('/ai/tools');
}

export async function runAiSkill(skillKey: string, input: string, context?: unknown): Promise<any> {
  return request<any>(`/ai/skills/${skillKey}/run`, {
    method: 'POST',
    body: JSON.stringify({ input, context }),
  });
}

export async function getAiModels(): Promise<any[]> {
  return request<any[]>('/ai/models');
}

export async function getAiLogs(): Promise<any[]> {
  return request<any[]>('/ai/logs');
}

export async function setDefaultAiModel(id: number): Promise<any> {
  return request<any>(`/ai/models/${id}/default`, { method: 'POST' });
}

export async function updateAiSettings(payload: Partial<AiSettings>): Promise<AiSettings> {
  return request<AiSettings>('/ai/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateAiPrompt(id: number, payload: any): Promise<any> {
  return request<any>(`/ai/prompts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateAiSkill(id: number, payload: any): Promise<any> {
  return request<any>(`/ai/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateAiTool(id: number, payload: any): Promise<any> {
  return request<any>(`/ai/tools/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getAiRules(): Promise<any[]> {
  return request<any[]>('/ai/rules');
}

export async function updateAiRule(id: number, payload: any): Promise<any> {
  return request<any>(`/ai/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getAiConversations(): Promise<any[]> {
  return request<any[]>('/ai/conversations');
}

export async function getAiConversation(id: number): Promise<any> {
  return request<any>(`/ai/conversations/${id}`);
}

export async function ingestAiConversation(payload: any): Promise<any> {
  return request<any>('/ai/conversations/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function decideAiConversation(id: number): Promise<any> {
  return request<any>(`/ai/conversations/${id}/decide`, {
    method: 'POST',
  });
}
