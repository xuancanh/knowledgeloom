import { useEffect, useState } from 'react';

export function useNow(refreshMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), refreshMs);
    return () => window.clearInterval(interval);
  }, [refreshMs]);

  return now;
}
