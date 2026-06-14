export async function getPublicConfig() {
  const res = await fetch('/api/subscriber-portal/app-config');

  if (!res.ok) {
    throw new Error('Failed to load subscriber app config');
  }

  return res.json();
}
