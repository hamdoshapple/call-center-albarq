import { api } from './client';

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
  const res = await api.get('/ai/status');
  return res.data.data;
}

export async function bootstrapAi(): Promise<{ message: string }> {
  const res = await api.post('/ai/bootstrap');
  return res.data.data;
}

export async function syncOllamaModels(): Promise<any[]> {
  const res = await api.post('/ai/models/sync-ollama');
  return res.data.data;
}

export async function getAiPrompts(): Promise<any[]> {
  const res = await api.get('/ai/prompts');
  return res.data.data;
}

export async function getAiSkills(): Promise<any[]> {
  const res = await api.get('/ai/skills');
  return res.data.data;
}

export async function getAiTools(): Promise<any[]> {
  const res = await api.get('/ai/tools');
  return res.data.data;
}
