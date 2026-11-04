import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { dashboardSummarySchema } from '@market/shared';
import { createTestApp } from './helpers/app.js';
import { createUser, signToken } from './helpers/auth.js';
import { createAgreement, createConversation } from './helpers/factories.js';
import { prisma, resetDb } from './helpers/db.js';

describe('GET /dashboard/summary', () => {
  let app: INestApplication;
  let server: Server;
  let user: { id: string };
  let token: string;
  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    token = signToken(app, { id: user.id, role: 'USER' });
  });
  it('requires authentication', async () => {
    await request(server).get('/api/v1/dashboard/summary').expect(401);
  });
  it('returns grouped listing, bid, agreement, notification and message counts', async () => {
    const provider = await createUser();
    const fixture = await createAgreement({
      buyer: user,
      provider,
      listing: {},
      amountCents: 1000,
    });
    const fixture2 = await createAgreement({
      buyer: user,
      provider,
      listing: {},
      amountCents: 2000,
    });
    await prisma.agreement.update({
      where: { id: fixture2.agreement.id },
      data: { status: 'DELIVERED' },
    });
    await prisma.listing.update({
      where: { id: fixture.listing.id },
      data: { status: 'COMPLETED' },
    });
    const category = await prisma.category.create({
      data: { name: 'Dash', slug: `dash-${crypto.randomUUID()}` },
    });
    await prisma.listing.createMany({
      data: [
        {
          ownerId: user.id,
          categoryId: category.id,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open listing',
          description: 'Long enough dashboard fixture description',
          priceType: 'FIXED',
          priceMinCents: 1,
          currency: 'USD',
        },
        {
          ownerId: user.id,
          categoryId: category.id,
          kind: 'REQUEST',
          status: 'IN_PROGRESS',
          title: 'Progress listing',
          description: 'Long enough dashboard fixture description',
          priceType: 'FIXED',
          priceMinCents: 1,
          currency: 'USD',
        },
      ],
    });
    const [open, progress] = await Promise.all([
      prisma.listing.findFirstOrThrow({
        where: { ownerId: user.id, status: 'OPEN' },
      }),
      prisma.listing.findFirstOrThrow({
        where: { ownerId: user.id, status: 'IN_PROGRESS' },
      }),
    ]);
    await prisma.bid.createMany({
      data: [
        {
          listingId: open.id,
          bidderId: user.id,
          amountCents: 1,
          currency: 'USD',
          deliveryDays: 1,
          message: 'pending',
          status: 'PENDING',
        },
        {
          listingId: progress.id,
          bidderId: user.id,
          amountCents: 1,
          currency: 'USD',
          deliveryDays: 1,
          message: 'countered',
          status: 'COUNTERED',
        },
      ],
    });
    await prisma.notification.createMany({
      data: [
        { userId: user.id, type: 'MESSAGE_RECEIVED', title: 'Unread', body: 'x' },
        { userId: user.id, type: 'MESSAGE_RECEIVED', title: 'Read', body: 'x', readAt: new Date() },
      ],
    });
    const conversation = await createConversation({
      userAId: user.id,
      userBId: provider.id,
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: provider.id,
        type: 'TEXT',
        body: 'Unread message',
      },
    });
    const response = await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({
      listings: { open: 1, inProgress: 2, completed: 1 },
      bids: { pending: 2, accepted: 0 },
      agreements: { active: 2, completed: 0 },
      unreadMessages: 1,
      unreadNotifications: 1,
    });
    dashboardSummarySchema.parse(response.body);
  });
});
