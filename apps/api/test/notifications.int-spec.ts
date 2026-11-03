import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 30; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for notification');
};
describe('notifications', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    await app?.close();
    app = await createTestApp();
  });
  afterAll(async () => app?.close());
  const pair = async () => {
    const a = await registerAndLogin(app, `na-${crypto.randomUUID()}@test.local`);
    const b = await registerAndLogin(app, `nb-${crypto.randomUUID()}@test.local`);
    const c = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    return { a, b, id: c.body.id as string };
  };
  const send = (token: string, id: string, body: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(token))
      .send({ type: 'TEXT', body });
  const service = () => app.get(NotificationsService);

  it('requires authentication to list notifications', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });
  it('requires authentication to get unread count', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').expect(401);
  });
  it('requires authentication to mark one notification read', async () => {
    await request(app.getHttpServer()).post('/api/v1/notifications/x/read').expect(401);
  });
  it('requires authentication to mark all notifications read', async () => {
    await request(app.getHttpServer()).post('/api/v1/notifications/read-all').send({}).expect(401);
  });
  it('coalesces a second message into one unread notification', async () => {
    const { a, b, id } = await pair();
    await send(a.accessToken, id, 'one');
    await waitFor(async () => (await prisma.notification.count()) > 0);
    const first = await prisma.notification.findFirstOrThrow();
    await send(a.accessToken, id, 'two');
    await waitFor(async () => (await prisma.notification.findFirstOrThrow()).body === 'two');
    expect(await prisma.notification.count({ where: { userId: b.user.id } })).toBe(1);
    expect((await prisma.notification.findFirstOrThrow()).id).toBe(first.id);
  });
  it('coalesces ten concurrent messages into one notification', async () => {
    const { a, b, id } = await pair();
    await Promise.all(Array.from({ length: 10 }, (_, i) => send(a.accessToken, id, `m${i}`)));
    await waitFor(
      async () => (await prisma.notification.count({ where: { userId: b.user.id } })) === 1,
    );
    expect(await prisma.notification.count({ where: { userId: b.user.id } })).toBe(1);
  });
  it('creates a new notification after the old coalesced notification is read', async () => {
    const { a, b, id } = await pair();
    await send(a.accessToken, id, 'one');
    await waitFor(async () => (await prisma.notification.count()) === 1);
    const old = await prisma.notification.findFirstOrThrow();
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${old.id}/read`)
      .set(auth(b.accessToken))
      .expect(201);
    await send(a.accessToken, id, 'two');
    await waitFor(async () => (await prisma.notification.count()) === 2);
    expect(await prisma.notification.count({ where: { userId: b.user.id } })).toBe(2);
  });
  it('filters notifications to unread rows', async () => {
    const b = await registerAndLogin(app, 'filter@test.local');
    const one = await service().notify(b.user.id, {
      type: 'BID_RECEIVED',
      title: 'one',
      body: 'one',
    });
    await service().notify(b.user.id, { type: 'BID_UPDATED', title: 'two', body: 'two' });
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${one.id}/read`)
      .set(auth(b.accessToken))
      .expect(201);
    const list = await request(app.getHttpServer())
      .get('/api/v1/notifications?unread=true')
      .set(auth(b.accessToken))
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].body).toBe('two');
  });
  it('paginates notifications with a next cursor', async () => {
    const b = await registerAndLogin(app, 'page-notes@test.local');
    await Promise.all(
      ['one', 'two', 'three'].map((body) =>
        service().notify(b.user.id, { type: 'BID_RECEIVED', title: body, body }),
      ),
    );
    const first = await request(app.getHttpServer())
      .get('/api/v1/notifications?limit=1')
      .set(auth(b.accessToken))
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .query({ limit: 1, cursor: first.body.nextCursor })
      .set(auth(b.accessToken))
      .expect(200);
    expect(first.body.nextCursor).toBeTruthy();
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });
  it('keeps read operations from reordering notification activity', async () => {
    const b = await registerAndLogin(app, 'stable-notes@test.local');
    const old = await service().notify(b.user.id, {
      type: 'BID_RECEIVED',
      title: 'old',
      body: 'old',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const recent = await service().notify(b.user.id, {
      type: 'BID_UPDATED',
      title: 'recent',
      body: 'recent',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${old.id}/read`)
      .set(auth(b.accessToken))
      .expect(201);
    const list = (await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set(auth(b.accessToken))) as { body: { items: Array<{ id: string }> } };
    expect(list.body.items.map((item) => item.id)).toEqual([recent.id, old.id]);
  });
  it('returns 404 when reading another users notification', async () => {
    const a = await registerAndLogin(app, 'note-owner@test.local');
    const b = await registerAndLogin(app, 'note-other@test.local');
    const note = await service().notify(a.user.id, { type: 'BID_RECEIVED', title: 'n', body: 'n' });
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${note.id}/read`)
      .set(auth(b.accessToken))
      .expect(404);
  });
  it('marks all notifications read and makes unread count zero', async () => {
    const b = await registerAndLogin(app, 'readall@test.local');
    await service().notify(b.user.id, { type: 'BID_RECEIVED', title: 'n1', body: 'n1' });
    await service().notify(b.user.id, { type: 'BID_UPDATED', title: 'n2', body: 'n2' });
    await request(app.getHttpServer())
      .post('/api/v1/notifications/read-all')
      .set(auth(b.accessToken))
      .send({})
      .expect(201);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/notifications/unread-count')
          .set(auth(b.accessToken))
      ).body.count,
    ).toBe(0);
  });
});
