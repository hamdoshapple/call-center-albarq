import type { Agent, AgentStatus } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type AgentInput = Omit<Agent, 'id' | 'performance' | 'createdAt'> & {
  performance?: Agent['performance'];
};

const emptyPerf = () => ({
  callsHandled: 0,
  callsMissed: 0,
  avgHandleTime: 0,
  totalTalkTime: 0,
  satisfaction: 0,
  occupancy: 0,
});

export function listAgents() {
  return mock(() => [...store.agents]);
}

export function getAgent(id: string) {
  return mock(() => store.agents.find((a) => a.id === id) ?? null);
}

export function createAgent(input: AgentInput) {
  const agent: Agent = {
    ...input,
    id: uid('a'),
    performance: input.performance ?? emptyPerf(),
    createdAt: new Date().toISOString(),
  };
  store.agents.unshift(agent);
  syncDepartmentMembership(agent.id, agent.departmentId);
  return mock(agent);
}

export function updateAgent(id: string, patch: Partial<AgentInput>) {
  const idx = store.agents.findIndex((a) => a.id === id);
  if (idx === -1) return mock(null);
  store.agents[idx] = { ...store.agents[idx], ...patch };
  if (patch.departmentId) syncDepartmentMembership(id, patch.departmentId);
  return mock(store.agents[idx]);
}

export function setAgentStatus(id: string, status: AgentStatus) {
  return updateAgent(id, { status } as Partial<AgentInput>);
}

export function deleteAgent(id: string) {
  store.agents = store.agents.filter((a) => a.id !== id);
  store.departments.forEach((d) => {
    d.agentIds = d.agentIds.filter((x) => x !== id);
  });
  store.queues.forEach((q) => {
    q.agentIds = q.agentIds.filter((x) => x !== id);
  });
  return mock({ success: true });
}

function syncDepartmentMembership(agentId: string, departmentId: string) {
  store.departments.forEach((d) => {
    d.agentIds = d.agentIds.filter((x) => x !== agentId);
    if (d.id === departmentId && !d.agentIds.includes(agentId)) d.agentIds.push(agentId);
  });
}
