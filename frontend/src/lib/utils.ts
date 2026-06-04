import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatDateTime(iso: string, locale = 'ar'): string {
  try {
    return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-IQ' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDate(iso: string, locale = 'ar'): string {
  try {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-IQ' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatCurrency(amount: number, locale = 'ar'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-IQ' : 'en-US', {
    style: 'currency',
    currency: 'IQD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


