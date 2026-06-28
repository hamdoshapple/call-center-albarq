import { useEffect, useRef, useState } from 'react';
import { Play, Loader2, AlertCircle } from 'lucide-react';
import { formatDuration, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  durationSec: number;
  label?: string;
  compact?: boolean;
  src?: string;
}

export function AudioPlayer({ durationSec, label, compact, src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef('');
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cleanup = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  const loadAudio = async () => {
    if (!src || loading) return;

    if (blobUrl) {
      audioRef.current?.play().catch(() => {});
      return;
    }

    const token = localStorage.getItem('cc_token') || '';

    try {
      setError('');
      setLoading(true);

      const res = await fetch(src, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      cleanup();

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setBlobUrl(url);

      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 50);
    } catch (e: any) {
      setError(e?.message || 'Audio load error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('rounded-lg border bg-card p-2', compact ? 'min-w-[200px]' : 'w-full')}>
      {label && !compact && <p className="mb-2 truncate text-xs font-medium">{label}</p>}

      {error ? (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" />
          فشل تحميل التسجيل
        </div>
      ) : blobUrl ? (
        <audio ref={audioRef} className="w-full" controls preload="none" src={blobUrl} />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          disabled={!src || loading}
          onClick={loadAudio}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {loading ? 'جاري تحميل التسجيل...' : 'تشغيل التسجيل'}
        </Button>
      )}

      <div className="mt-1 text-xs text-muted-foreground">
        {formatDuration(durationSec)}
      </div>
    </div>
  );
}
