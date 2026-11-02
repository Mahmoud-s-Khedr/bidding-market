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
  const design = await prisma.category.upsert({
    where: { slug: 'design' },
    update: {},
    create: { name: 'Design', slug: 'design', parentId: category.id },
  });
  const tech = await prisma.category.upsert({
    where: { slug: 'technology' },
    update: {},
    create: { name: 'Technology', slug: 'technology' },
  });
  const webDev = await prisma.category.upsert({
    where: { slug: 'web-development' },
    update: {},
    create: { name: 'Web Development', slug: 'web-development', parentId: tech.id },
  });
  const mobileDev = await prisma.category.upsert({
    where: { slug: 'mobile-development' },
    update: {},
    create: { name: 'Mobile Development', slug: 'mobile-development', parentId: tech.id },
  });
  const writing = await prisma.category.upsert({
    where: { slug: 'writing' },
    update: {},
    create: { name: 'Writing & Translation', slug: 'writing' },
  });

  const bob = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@market.test' } });

  const seedListings = [
    {
      id: 'demo-listing-1',
      title: 'Build a marketplace landing page',
      description:
        'Need an experienced engineer to build a high converting responsive marketplace landing page.',
      categoryId: design.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.RANGE,
      priceMinCents: 50000,
      priceMaxCents: 100000,
      location: 'San Francisco, CA',
      tags: ['landing-page', 'marketplace', 'design'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-2',
      title: 'Design a brand identity and logo system',
      description:
        'Professional visual designer offering complete branding packages for modern tech startups.',
      categoryId: design.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.FIXED,
      priceMinCents: 75000,
      priceMaxCents: null,
      location: 'New York, NY',
      tags: ['branding', 'logo', 'identity'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-3',
      title: 'Write product documentation and API guides',
      description:
        'Looking for a technical writer to create comprehensive user guides and OpenAPI reference documentation.',
      categoryId: writing.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.NEGOTIABLE,
      priceMinCents: null,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['docs', 'api', 'technical-writing'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-4',
      title: 'Create an iOS and Android mobile prototype',
      description:
        'Senior mobile developer available to turn Figma designs into interactive Flutter or React Native prototypes.',
      categoryId: mobileDev.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.RANGE,
      priceMinCents: 30000,
      priceMaxCents: 60000,
      location: 'Austin, TX',
      tags: ['mobile', 'prototype', 'ios', 'android'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-5',
      title: 'SEO content strategy and keyword research',
      description:
        'Seeking an organic search specialist to audit existing content and build a 6-month growth roadmap.',
      categoryId: writing.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.FIXED,
      priceMinCents: 25000,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['seo', 'content', 'growth'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-6',
      title: 'Data analytics dashboard design and charts',
      description:
        'Offering clean, responsive dashboard UX designs using Tailwind CSS and interactive chart primitives.',
      categoryId: webDev.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.RANGE,
      priceMinCents: 80000,
      priceMaxCents: 150000,
      location: 'Seattle, WA',
      tags: ['dashboard', 'analytics', 'data-viz'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-7',
      title: 'Full-stack NestJS backend architecture and consulting',
      description:
        'Architecting scalable modular backends with PostgreSQL, Redis caching, and real-time WebSockets.',
      categoryId: tech.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.FIXED,
      priceMinCents: 120000,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['nestjs', 'backend', 'architecture'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-8',
      title: 'Next.js 16 frontend performance tuning and SSR audit',
      description:
        'Need an expert to eliminate client-side hydration waterfalls and optimize Core Web Vitals.',
      categoryId: webDev.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.RANGE,
      priceMinCents: 40000,
      priceMaxCents: 80000,
      location: 'San Francisco, CA',
      tags: ['nextjs', 'react', 'performance'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-9',
      title: 'iOS Swift payment gateway module integration',
      description:
        'Looking for a native iOS engineer to integrate Apple Pay and custom checkout flows securely.',
      categoryId: mobileDev.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.FIXED,
      priceMinCents: 95000,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['ios', 'swift', 'payments'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-10',
      title: 'Technical whitepaper copywriting and editing',
      description:
        'Experienced tech writer offering deep-dive whitepaper drafting for distributed systems and fintech.',
      categoryId: writing.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.RANGE,
      priceMinCents: 15000,
      priceMaxCents: 30000,
      location: 'Remote',
      tags: ['whitepaper', 'fintech', 'copywriting'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-11',
      title: 'Custom icon pack and vector illustration set',
      description:
        'Delivering tailored SVG icon sets and brand illustrations matching your design language.',
      categoryId: design.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.FIXED,
      priceMinCents: 15000,
      priceMaxCents: null,
      location: 'Chicago, IL',
      tags: ['icons', 'vector', 'illustrations'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-12',
      title: 'PostgreSQL database query optimization and indexing',
      description:
        'Need a database specialist to analyze slow query logs, optimize GIN indexes, and restructure execution plans.',
      categoryId: tech.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.NEGOTIABLE,
      priceMinCents: null,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['postgres', 'database', 'optimization'],
      ownerId: bob.id,
    },
    {
      id: 'demo-listing-13',
      title: 'Enterprise security compliance and dependency audit',
      description:
        'Comprehensive static analysis, license verification, and CVE vulnerability remediation.',
      categoryId: tech.id,
      kind: ListingKind.REQUEST,
      priceType: PriceType.FIXED,
      priceMinCents: 250000,
      priceMaxCents: null,
      location: 'Remote',
      tags: ['security', 'compliance', 'audit'],
      ownerId: alice.id,
    },
    {
      id: 'demo-listing-14',
      title: 'Cross-platform React Native app redesign and accessibility',
      description:
        'Complete UI/UX refresh ensuring WCAG 2.1 AA compliance, voiceover support, and smooth 60fps animations.',
      categoryId: mobileDev.id,
      kind: ListingKind.OFFER,
      priceType: PriceType.RANGE,
      priceMinCents: 100000,
      priceMaxCents: 200000,
      location: 'Remote',
      tags: ['react-native', 'a11y', 'redesign'],
      ownerId: bob.id,
    },
  ];

  for (const item of seedListings) {
    await prisma.listing.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        description: item.description,
        categoryId: item.categoryId,
        kind: item.kind,
        status: ListingStatus.OPEN,
        priceType: item.priceType,
        priceMinCents: item.priceMinCents,
        priceMaxCents: item.priceMaxCents,
        location: item.location,
        tags: item.tags,
      },
      create: {
        id: item.id,
        ownerId: item.ownerId,
        categoryId: item.categoryId,
        kind: item.kind,
        status: ListingStatus.OPEN,
        title: item.title,
        description: item.description,
        priceType: item.priceType,
        priceMinCents: item.priceMinCents,
        priceMaxCents: item.priceMaxCents,
        location: item.location,
        tags: item.tags,
      },
    });
  }
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
