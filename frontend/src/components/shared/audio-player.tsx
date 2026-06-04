import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration, cn } from '@/lib/utils';

interface AudioPlayerProps {
  durationSec: number;
  label?: string;
  compact?: boolean;
}

/**
 * Mock audio player. There are no real recordings in demo mode, so playback is
 * simulated with a timer. When wiring a real backend, replace the simulation
 * with a native <audio> element pointed at the recording URL.
 */
export function AudioPlayer({ durationSec, label, compact }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (playing) {
      ref.current = window.setInterval(() => {
        setPos((p) => {
          if (p >= durationSec) {
            setPlaying(false);
            return durationSec;
          }
          return p + 1;
        });
      }, 1000);
    }
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [playing, durationSec]);

  const toggle = () => {
    if (pos >= durationSec) setPos(0);
    setPlaying((p) => !p);
  };

  const reset = () => {
    setPlaying(false);
    setPos(0);
  };

  const progress = durationSec ? (pos / durationSec) * 100 : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-2',
        compact ? 'min-w-[200px]' : 'w-full'
      )}
    >
      <Button size="icon-sm" variant={playing ? 'default' : 'secondary'} onClick={toggle} className="rounded-full">
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
