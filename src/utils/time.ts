export function getCustomLookbackDate(days: number): Date {
  const lookback = new Date();
  lookback.setHours(0, 0, 0, 0);
  lookback.setDate(lookback.getDate() - days);
  return lookback;
}

export function getLookbackDate(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat

  const lookback = new Date(now);
  lookback.setHours(0, 0, 0, 0);

  if (dayOfWeek === 1) {
    // Monday: look back to last Thursday (4 days)
    lookback.setDate(lookback.getDate() - 4);
  } else {
    // Any other day: look back to yesterday
    lookback.setDate(lookback.getDate() - 1);
  }

  return lookback;
}

export function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
