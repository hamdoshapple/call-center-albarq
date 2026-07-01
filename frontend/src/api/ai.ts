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
