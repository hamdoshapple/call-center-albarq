import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (toasts: ToastData[]) => void;

let toasts: ToastData[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l([...toasts]));
}

export function toast(data: Omit<ToastData, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const item: ToastData = { id, duration: 4000, variant: 'default', ...data };
  toasts = [item, ...toasts].slice(0, 5);
  emit();
  if (item.duration && item.duration > 0) {
    setTimeout(() => dismissToast(id), item.duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [items, setItems] = useState<ToastData[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return { toasts: items, toast, dismiss: dismissToast };
}
