import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryCreateInput, CategoryTreeNode, CategoryUpdateInput } from '@market/shared';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.module.js';

const CACHE_KEY = 'cache:categories:tree';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async invalidateCache(): Promise<void> {
    await this.redis.del(CACHE_KEY);
  }

  async getTree(): Promise<CategoryTreeNode[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as CategoryTreeNode[];
      } catch {
        // Fall back to query on malformed cache
      }
    }

    const allCategories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, parentId: true, description: true },
    });

    const openListingCounts = await this.prisma.listing.groupBy({
      by: ['categoryId'],
      where: { status: 'OPEN' },
      _count: { id: true },
    });

    const directCounts = new Map<string, number>();
    for (const item of openListingCounts) {
      directCounts.set(item.categoryId, item._count.id);
    }

    const childrenMap = new Map<string, typeof allCategories>();
    for (const cat of allCategories) {
      if (cat.parentId) {
        const list = childrenMap.get(cat.parentId) ?? [];
        list.push(cat);
        childrenMap.set(cat.parentId, list);
      }
    }

    const countMemo = new Map<string, number>();
    const computeListingCount = (catId: string): number => {
      if (countMemo.has(catId)) return countMemo.get(catId)!;
      const direct = directCounts.get(catId) ?? 0;
      const children = childrenMap.get(catId) ?? [];
      const total =
        direct + children.reduce((sum, child) => sum + computeListingCount(child.id), 0);
      countMemo.set(catId, total);
      return total;
    };

    const buildSubtree = (parentId: string | null): CategoryTreeNode[] => {
      const nodes = allCategories.filter((c) => c.parentId === parentId);
      return nodes.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentId: c.parentId,
        description: c.description,
        listingCount: computeListingCount(c.id),
        children: buildSubtree(c.id),
      }));
    };

    const tree = buildSubtree(null);
    await this.redis.set(CACHE_KEY, JSON.stringify(tree), 'EX', 3600);
    return tree;
  }

  async getDescendantCategoryIds(categoryId: string): Promise<string[]> {
    const allCategories = await this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<string, string[]>();
    for (const cat of allCategories) {
      if (cat.parentId) {
        const list = childrenMap.get(cat.parentId) ?? [];
        list.push(cat.id);
        childrenMap.set(cat.parentId, list);
      }
    }
    const result: string[] = [];
    const queue = [...(childrenMap.get(categoryId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      const children = childrenMap.get(current);
      if (children) {
        queue.push(...children);
      }
    }
    return result;
  }

  private async isDescendantOf(
    potentialDescendantId: string,
    ancestorId: string,
  ): Promise<boolean> {
    let currentId: string | null = potentialDescendantId;
    const visited = new Set<string>();
    while (currentId) {
      if (currentId === ancestorId) return true;
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const categoryId: string = currentId;
      const cat = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { parentId: true },
      });
      currentId = cat?.parentId ?? null;
    }
    return false;
  }

  async create(input: CategoryCreateInput) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException('Category slug already exists');
    }

    if (input.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new BadRequestException('Parent category does not exist');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        parentId: input.parentId ?? null,
        description: input.description ?? null,
      },
    });

    await this.invalidateCache();
    return category;
  }

  async update(id: string, input: CategoryUpdateInput) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (input.slug && input.slug !== category.slug) {
      const existing = await this.prisma.category.findUnique({
        where: { slug: input.slug },
      });
      if (existing) {
        throw new ConflictException('Category slug already exists');
      }
    }

    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      if (input.parentId !== null) {
        const parent = await this.prisma.category.findUnique({
          where: { id: input.parentId },
        });
        if (!parent) {
          throw new BadRequestException('Parent category does not exist');
        }

        const isCycle = await this.isDescendantOf(input.parentId, id);
        if (isCycle) {
          throw new BadRequestException('Category cannot become a descendant of itself');
        }
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    await this.invalidateCache();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete category with subcategories');
    }

    const descendantIds = await this.getDescendantCategoryIds(id);
    const allIds = [id, ...descendantIds];

    const listingCount = await this.prisma.listing.count({
      where: { categoryId: { in: allIds } },
    });
    if (listingCount > 0) {
      throw new ConflictException('Cannot delete category with existing listings');
    }

    await this.prisma.category.delete({ where: { id } });
    await this.invalidateCache();
  }
}
