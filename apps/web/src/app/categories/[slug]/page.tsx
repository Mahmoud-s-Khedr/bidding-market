'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useCategories } from '@/lib/api/categories';
import { ListingsContent } from '@/app/listings/page';
import type { Category } from '@/lib/api/types';

function findCategoryPath(
  categories: Category[],
  targetSlug: string,
  currentPath: Category[] = [],
): Category[] | null {
  for (const cat of categories) {
    const newPath = [...currentPath, cat];
    if (cat.slug === targetSlug) {
      return newPath;
    }
    if (cat.children && cat.children.length > 0) {
      const childResult = findCategoryPath(cat.children, targetSlug, newPath);
      if (childResult) return childResult;
    }
  }
  return null;
}

export default function CategoryBrowsePage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const { data: categories = [] } = useCategories();

  const breadcrumbs = React.useMemo(() => {
    if (!slug) return [];
    return findCategoryPath(categories, slug) || [];
  }, [categories, slug]);

  const currentCategory = breadcrumbs[breadcrumbs.length - 1];

  return (
    <div className="flex flex-col flex-1">
      {/* Breadcrumb Bar */}
      <div className="border-b border-border bg-muted/20 py-3">
        <div className="container mx-auto px-4 sm:px-6">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Link
              href="/"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Home</span>
            </Link>

            <ChevronRight className="h-3.5 w-3.5 opacity-40 shrink-0" />

            <Link href="/listings" className="hover:text-foreground transition-colors">
              Listings
            </Link>

            {breadcrumbs.map((cat, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={cat.id}>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40 shrink-0" />
                  {isLast ? (
                    <span className="font-semibold text-foreground">{cat.name}</span>
                  ) : (
                    <Link
                      href={`/categories/${cat.slug}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {cat.name}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      </div>

      {currentCategory && (
        <div className="container mx-auto px-4 sm:px-6 pt-6">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {currentCategory.name}
          </h2>
          {currentCategory.description && (
            <p className="text-sm text-muted-foreground mt-1">{currentCategory.description}</p>
          )}
        </div>
      )}

      {/* Main browse view pre-filtered by categorySlug */}
      <React.Suspense
        fallback={
          <div className="container mx-auto px-4 py-8 sm:px-6">Loading category listings...</div>
        }
      >
        <ListingsContent initialCategorySlug={slug} />
      </React.Suspense>
    </div>
  );
}
