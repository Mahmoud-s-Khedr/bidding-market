import { describe, expect, it, vi } from 'vitest';
import { RealtimeService } from './realtime.service.js';
describe('RealtimeService', () => {
  it('emits to de-duplicated user rooms', () => {
    const service = new RealtimeService();
    const emit = vi.fn();
    service.setServer({ to: vi.fn(() => ({ emit })) } as never);
    service.emitToUser('u1', 'event', { ok: true });
    service.emitToUsers(['u1', 'u1', 'u2'], 'event', { ok: true });
    expect(emit).toHaveBeenCalledTimes(3);
  });
});
