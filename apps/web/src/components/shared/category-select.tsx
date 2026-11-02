import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/lib/api/categories';
import type { Category } from '@/lib/api/types';

export interface CategorySelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  valueType?: 'id' | 'slug';
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

interface FlatCategory {
  id: string;
  slug: string;
  name: string;
  depth: number;
}

function flattenCategories(categories: Category[] = [], depth = 0): FlatCategory[] {
  const result: FlatCategory[] = [];
  for (const cat of categories) {
    result.push({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      depth,
    });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, depth + 1));
    }
  }
  return result;
}

export function CategorySelect({
  value,
  onValueChange,
  valueType = 'id',
  placeholder = 'Select a category',
  disabled,
  error,
  id,
  className,
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
}: CategorySelectProps) {
  const { data: categories = [], isLoading } = useCategories();

  const flatList = React.useMemo(() => flattenCategories(categories), [categories]);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || isLoading}
      id={id}
      error={error}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
    >
      <SelectTrigger id={id} error={error} className={className}>
        <SelectValue placeholder={isLoading ? 'Loading categories...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {flatList.map((cat) => {
          const itemVal = valueType === 'slug' ? cat.slug : cat.id;
          const prefix = cat.depth > 0 ? `${'— '.repeat(cat.depth)}` : '';
          return (
            <SelectItem key={cat.id} value={itemVal}>
              <span className={cat.depth === 0 ? 'font-medium' : 'text-muted-foreground'}>
                {prefix}
                <span className={cat.depth === 0 ? 'text-foreground' : 'text-foreground/90'}>
                  {cat.name}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
