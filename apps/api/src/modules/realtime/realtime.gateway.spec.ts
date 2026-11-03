import { describe, expect, it, vi } from 'vitest';
import { RealtimeGateway } from './realtime.gateway.js';

describe('RealtimeGateway', () => {
  const setup = () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1' }) };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      conversationParticipant: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      message: { findFirst: vi.fn() },
    };
    const redis = {
      incr: vi.fn(),
      decr: vi.fn(),
      del: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      scard: vi.fn().mockResolvedValue(1),
      expire: vi.fn(),
      duplicate: vi.fn(() => ({})),
    };
    const realtime = { setServer: vi.fn(), emitToUsers: vi.fn() };
    return {
      gateway: new RealtimeGateway(
        jwt as never,
        prisma as never,
        redis as never,
        realtime as never,
        { read: vi.fn() } as never,
      ),
      jwt,
      prisma,
      redis,
      realtime,
    };
  };
  const socket = () => ({
    data: {},
    handshake: { auth: { token: 'token' } },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  });
  it('authenticates active users and rejects bad or banned handshakes', async () => {
    const { gateway, jwt, prisma } = setup();
    const good = socket();
    await (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(
      good,
    );
    expect(good.data).toEqual({ userId: 'u1' });
    jwt.verify.mockImplementationOnce(() => {
      throw new Error('bad');
    });
    await expect(
      (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(
        socket(),
      ),
    ).rejects.toThrow();
    prisma.user.findUnique.mockResolvedValueOnce({ status: 'BANNED' });
    await expect(
      (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(
        socket(),
      ),
    ).rejects.toThrow();
  });
  it('counts multiple sockets before announcing offline and validates join/typing', async () => {
    const { gateway, prisma, redis, realtime } = setup();
    const one = socket() as ReturnType<typeof socket> & { data: { userId?: string } };
    one.data.userId = 'u1';
    redis.scard.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversation: { participants: [{ userId: 'u1' }, { userId: 'u2' }] } },
    ]);
    await gateway.handleConnection(one as never);
    expect(one.join).toHaveBeenCalledWith('user:u1');
    await gateway.handleDisconnect(one as never);
    expect(redis.del).not.toHaveBeenCalled();
    await gateway.handleDisconnect(one as never);
    expect(redis.del).toHaveBeenCalled();
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);
    await expect(gateway.join(one as never, { conversationId: 'c1' })).resolves.toEqual({
      ok: false,
    });
    prisma.conversationParticipant.findUnique.mockResolvedValue({});
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    await expect(
      gateway.typing(one as never, { conversationId: 'c1', isTyping: true }),
    ).resolves.toEqual({ ok: true });
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ['u2'],
      'typing',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
