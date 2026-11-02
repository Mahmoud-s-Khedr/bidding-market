import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesService } from './categories.service.js';
import { AdminCategoriesController, CategoriesController } from './categories.controller.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    listing: {
      groupBy: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };
  let redis: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      category: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      listing: {
        groupBy: vi.fn(),
        count: vi.fn(),
      },
    };
    redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
    service = new CategoriesService(prisma as never, redis as never);
  });

  describe('getTree', () => {
    it('returns cached tree when present in Redis', async () => {
      const cached = [
        { id: '1', name: 'Tech', slug: 'tech', parentId: null, listingCount: 5, children: [] },
      ];
      redis.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.getTree();
      expect(result).toEqual(cached);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('builds tree and calculates aggregated listing counts across descendants', async () => {
      redis.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce([
        {
          id: 'parent',
          name: 'Services',
          slug: 'services',
          parentId: null,
          description: 'All services',
        },
        { id: 'child', name: 'Design', slug: 'design', parentId: 'parent', description: null },
        { id: 'grandchild', name: 'UI/UX', slug: 'ui-ux', parentId: 'child', description: null },
      ]);
      prisma.listing.groupBy.mockResolvedValueOnce([
        { categoryId: 'parent', _count: { id: 2 } },
        { categoryId: 'child', _count: { id: 3 } },
        { categoryId: 'grandchild', _count: { id: 5 } },
      ]);

      const result = await service.getTree();
      expect(result).toHaveLength(1);
      const root = result[0]!;
      expect(root.id).toBe('parent');
      // 2 + 3 + 5 = 10
      expect(root.listingCount).toBe(10);
      expect(root.children).toHaveLength(1);
      const child = root.children[0]!;
      expect(child.id).toBe('child');
      // 3 + 5 = 8
      expect(child.listingCount).toBe(8);
      expect(child.children).toHaveLength(1);
      const grandchild = child.children[0]!;
      expect(grandchild.id).toBe('grandchild');
      expect(grandchild.listingCount).toBe(5);
      expect(redis.set).toHaveBeenCalledWith('cache:categories:tree', expect.any(String), 'EX', 60);
    });
  });

  describe('create', () => {
    it('creates category and invalidates cache', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      prisma.category.create.mockResolvedValueOnce({
        id: 'new-id',
        name: 'Tech',
        slug: 'tech',
        parentId: null,
        description: null,
      });

      const res = await service.create({ name: 'Tech', slug: 'tech' });
      expect(res.id).toBe('new-id');
      expect(redis.del).toHaveBeenCalledWith('cache:categories:tree');
    });

    it('rejects duplicate slug with 409 Conflict', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.create({ name: 'Tech', slug: 'tech' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects non-existent parent with 400 BadRequest', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(null) // slug check
        .mockResolvedValueOnce(null); // parent check

      await expect(
        service.create({ name: 'Tech', slug: 'tech', parentId: 'missing' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('throws 404 when category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('missing', { name: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate slug on update', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'c1', slug: 'tech' }) // exists
        .mockResolvedValueOnce({ id: 'c2', slug: 'design' }); // other category with new slug

      await expect(service.update('c1', { slug: 'design' })).rejects.toThrow(ConflictException);
    });

    it('rejects setting category as its own parent', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1', slug: 'tech' });
      await expect(service.update('c1', { parentId: 'c1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects setting a descendant as parent (cycle prevention)', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'c1', slug: 'tech' }) // find category
        .mockResolvedValueOnce({ id: 'c3', parentId: 'c2' }) // parent check
        .mockResolvedValueOnce({ id: 'c3', parentId: 'c2' }) // walk up: c3 parent is c2
        .mockResolvedValueOnce({ id: 'c2', parentId: 'c1' }); // walk up: c2 parent is c1 -> cycle!

      await expect(service.update('c1', { parentId: 'c3' })).rejects.toThrow(BadRequestException);
    });

    it('updates category successfully and invalidates cache', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1', slug: 'tech' });
      prisma.category.update.mockResolvedValueOnce({
        id: 'c1',
        name: 'New Tech',
        slug: 'tech',
      });

      const res = await service.update('c1', { name: 'New Tech' });
      expect(res.name).toBe('New Tech');
      expect(redis.del).toHaveBeenCalledWith('cache:categories:tree');
    });
  });

  describe('delete', () => {
    it('throws 404 when category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when category has subcategories', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1' });
      prisma.category.count.mockResolvedValueOnce(2);

      await expect(service.delete('c1')).rejects.toThrow(ConflictException);
    });

    it('throws 409 when category or descendants have listings', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1' });
      prisma.category.count.mockResolvedValueOnce(0); // childCount
      prisma.category.findMany.mockResolvedValueOnce([]); // descendants query
      prisma.listing.count.mockResolvedValueOnce(3); // listings count

      await expect(service.delete('c1')).rejects.toThrow(ConflictException);
    });

    it('deletes category and invalidates cache', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1' });
      prisma.category.count.mockResolvedValueOnce(0);
      prisma.category.findMany.mockResolvedValueOnce([]);
      prisma.listing.count.mockResolvedValueOnce(0);
      prisma.category.delete.mockResolvedValueOnce({ id: 'c1' });

      await service.delete('c1');
      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(redis.del).toHaveBeenCalledWith('cache:categories:tree');
    });
  });

  describe('Controllers', () => {
    it('CategoriesController delegates getTree', async () => {
      const tree = [
        {
          id: '1',
          name: 'A',
          slug: 'a',
          parentId: null,
          description: null,
          listingCount: 0,
          children: [],
        },
      ];
      vi.spyOn(service, 'getTree').mockResolvedValueOnce(tree);
      const controller = new CategoriesController(service);
      expect(await controller.getTree()).toBe(tree);
    });

    it('AdminCategoriesController delegates create, update, delete', async () => {
      vi.spyOn(service, 'create').mockResolvedValueOnce({ id: '1' } as never);
      vi.spyOn(service, 'update').mockResolvedValueOnce({ id: '1' } as never);
      vi.spyOn(service, 'delete').mockResolvedValueOnce(undefined);

      const controller = new AdminCategoriesController(service);
      expect(await controller.create({ name: 'A', slug: 'a' })).toEqual({ id: '1' });
      expect(await controller.update({ id: '1' }, { name: 'B' })).toEqual({ id: '1' });
      expect(await controller.delete({ id: '1' })).toBeUndefined();
    });
  });
});
