import { config } from 'dotenv';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Role,
  ListingKind,
  ListingStatus,
  PriceType,
} from '../src/generated/prisma/client.js';
config({ path: '../../.env' });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});
async function main(): Promise<void> {
  const password = await argon2.hash('Password123!', { type: argon2.argon2id });
  const adminPassword = await argon2.hash('Admin12345!', { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: 'admin@market.test' },
    update: {},
    create: {
      email: 'admin@market.test',
      passwordHash: adminPassword,
      displayName: 'Admin',
      role: Role.ADMIN,
    },
  });
  const alice = await prisma.user.upsert({
    where: { email: 'alice@market.test' },
    update: {},
    create: { email: 'alice@market.test', passwordHash: password, displayName: 'Alice' },
  });
  await prisma.user.upsert({
    where: { email: 'bob@market.test' },
    update: {},
    create: { email: 'bob@market.test', passwordHash: password, displayName: 'Bob' },
  });
  const category = await prisma.category.upsert({
    where: { slug: 'services' },
    update: {},
    create: { name: 'Services', slug: 'services' },
  });
  await prisma.listing.upsert({
    where: { id: 'demo-listing-alice' },
    update: {},
    create: {
      id: 'demo-listing-alice',
      ownerId: alice.id,
      categoryId: category.id,
      kind: ListingKind.REQUEST,
      status: ListingStatus.OPEN,
      title: 'Build a marketplace landing page',
      description: 'A demo listing used for local development and end to end testing.',
      priceType: PriceType.RANGE,
      priceMinCents: 50000,
      priceMaxCents: 100000,
    },
  });
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
