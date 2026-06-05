import { useEffect, useRef, useState } from 'react';
import { formatDuration, cn } from '@/lib/utils';

interface AudioPlayerProps {
  durationSec: number;
  label?: string;
  compact?: boolean;
  src?: string;
}

export function AudioPlayer({ durationSec, label, compact, src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!src) return;

    let objectUrl = '';
    const token = localStorage.getItem('cc_token') || '';

    setError('');
    setBlobUrl('');

    fetch(src, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((e) => {
        setError(e?.message || 'Audio load error');
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <div className={cn('rounded-lg border bg-card p-2', compact ? 'min-w-[200px]' : 'w-full')}>
      {label && !compact && <p className="mb-2 truncate text-xs font-medium">{label}</p>}

      {error ? (
        <div className="text-xs text-destructive">فشل تحميل التسجيل</div>
      ) : blobUrl ? (
        <audio ref={audioRef} className="w-full" controls preload="metadata" src={blobUrl} />
      ) : (
        <div className="text-xs text-muted-foreground">جارٍ تحميل التسجيل...</div>
      )}

      <div className="mt-1 text-xs text-muted-foreground">
        {formatDuration(durationSec)}
      </div>
    </div>
  );
}
