import { getPracticeSession } from './practice';

// The native startup sync sends no financial data through this event.
export function onBankFeedsUpdated(listener: () => void): () => void {
  const runtime = (globalThis as any)?.runtime;
  if (!runtime || typeof runtime.EventsOn !== 'function') return () => {};
  return runtime.EventsOn('bank-feeds-updated', () => {
    if (!getPracticeSession()) listener();
  });
}
