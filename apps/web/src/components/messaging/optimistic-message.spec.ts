import { describe, expect, it } from 'vitest';
import { isMatchingOptimistic, type OptimisticMessage } from './optimistic-message';
import { makeAttachment, makeMessage, makeUser } from '../../../test/fixtures';

describe('optimistic-message reconciliation', () => {
  const user = makeUser({ id: 'u1', displayName: 'Alice' });
  const otherUser = makeUser({ id: 'u2', displayName: 'Bob' });

  it('matches when id is identical', () => {
    const msg = makeMessage({ id: 'msg-1', sender: user, body: 'Hello' });
    expect(isMatchingOptimistic(msg, msg)).toBe(true);
  });

  it('returns false for non-temp id that does not match server id', () => {
    const opt: OptimisticMessage = makeMessage({ id: 'msg-1', sender: user, body: 'Hello' });
    const server = makeMessage({ id: 'msg-2', sender: user, body: 'Hello' });
    expect(isMatchingOptimistic(opt, server)).toBe(false);
  });

  it('matches temp message with server echo on sender, type, and body', () => {
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'TEXT',
        body: 'Hello world!',
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: user,
      type: 'TEXT',
      body: 'Hello world!',
    });
    expect(isMatchingOptimistic(opt, server)).toBe(true);
  });

  it('does not match if sender differs', () => {
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'TEXT',
        body: 'Hello world!',
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: otherUser,
      type: 'TEXT',
      body: 'Hello world!',
    });
    expect(isMatchingOptimistic(opt, server)).toBe(false);
  });

  it('does not match if type differs', () => {
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'TEXT',
        body: 'Hello world!',
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: user,
      type: 'IMAGE',
      body: 'Hello world!',
    });
    expect(isMatchingOptimistic(opt, server)).toBe(false);
  });

  it('does not match if body differs', () => {
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'TEXT',
        body: 'Message A',
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: user,
      type: 'TEXT',
      body: 'Message B',
    });
    expect(isMatchingOptimistic(opt, server)).toBe(false);
  });

  it('matches attachments by id or fileName', () => {
    const att1 = makeAttachment({ id: 'att-1', fileName: 'photo.png' });
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'IMAGE',
        attachments: [att1],
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: user,
      type: 'IMAGE',
      attachments: [att1],
    });
    expect(isMatchingOptimistic(opt, server)).toBe(true);
  });

  it('does not match if attachment count differs', () => {
    const att1 = makeAttachment({ id: 'att-1', fileName: 'photo.png' });
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-12345',
        sender: user,
        type: 'IMAGE',
        attachments: [att1],
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-999',
      sender: user,
      type: 'IMAGE',
      attachments: [],
    });
    expect(isMatchingOptimistic(opt, server)).toBe(false);
  });

  it('matches voice message with similar duration', () => {
    const opt: OptimisticMessage = {
      ...makeMessage({
        id: 'temp-voice',
        sender: user,
        type: 'VOICE',
        voiceDurationSec: 5,
      }),
      _status: 'pending',
    };
    const server = makeMessage({
      id: 'server-voice',
      sender: user,
      type: 'VOICE',
      voiceDurationSec: 6,
    });
    expect(isMatchingOptimistic(opt, server)).toBe(true);
  });
});
