import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration, cn } from '@/lib/utils';

interface AudioPlayerProps {
  durationSec: number;
  label?: string;
  compact?: boolean;
  src?: string;
}

export function AudioPlayer({ durationSec, label, compact, src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!src) return;

    let revoked = '';
    const token = localStorage.getItem('cc_token') || '';

    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`Audio error ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoked = url;
        setObjectUrl(url);
      })
      .catch(() => setObjectUrl(''));

    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setPos(Math.floor(audio.currentTime || 0));
    const onEnd = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, [objectUrl]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !objectUrl) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      await audio.play();
      setPlaying(true);
    }
  };

  const reset = () => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    setPlaying(false);
    setPos(0);
  };

  const progress = durationSec ? (pos / durationSec) * 100 : 0;

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border bg-card p-2', compact ? 'min-w-[200px]' : 'w-full')}>
      <audio ref={audioRef} src={objectUrl || undefined} preload="metadata" />
      <Button size="icon-sm" variant={playing ? 'default' : 'secondary'} onClick={toggle} disabled={!objectUrl} className="rounded-full">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1 space-y-1">
        {label && !compact && <p className="text-xs font-medium truncate">{label}</p>}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            {formatDuration(pos)} / {formatDuration(durationSec)}
          </span>
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" onClick={reset} title="reset">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      {!compact && <Volume2 className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}
