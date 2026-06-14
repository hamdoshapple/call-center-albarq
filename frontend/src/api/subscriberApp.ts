import { api } from './client';

export async function getPublicConfig() {
  const { data } = await api.get('/subscriber-portal/app-config');
  return data;
}
