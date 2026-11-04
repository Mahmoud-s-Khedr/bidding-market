'use client';

import * as React from 'react';
import {
  AlertCircle,
  Edit2,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Plus,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useCategories } from '@/lib/api/categories';
import {
  useCreateAdminCategory,
  useDeleteAdminCategory,
  useUpdateAdminCategory,
} from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import type { Category } from '@/lib/api/types';

interface FlatCategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  listingCount: number;
  depth: number;
  hasChildren: boolean;
}

function flattenTree(nodes: Category[] = [], depth = 0): FlatCategoryItem[] {
  const result: FlatCategoryItem[] = [];
  for (const node of nodes) {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    result.push({
      id: node.id,
      name: node.name,
      slug: node.slug,
      parentId: node.parentId,
      description: node.description,
      listingCount: node.listingCount,
      depth,
      hasChildren,
    });
    if (hasChildren) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AdminCategoriesPage() {
  const { data: categories = [], isLoading, isError, error, refetch } = useCategories();

  const createCategoryMutation = useCreateAdminCategory();
  const updateCategoryMutation = useUpdateAdminCategory();
  const deleteCategoryMutation = useDeleteAdminCategory();

  // Create / Edit modal state
  const [dialogMode, setDialogMode] = React.useState<'create' | 'edit' | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null);

  const [formName, setFormName] = React.useState('');
  const [formSlug, setFormSlug] = React.useState('');
  const [formParentId, setFormParentId] = React.useState<string>('none');
  const [formDescription, setFormDescription] = React.useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Delete confirm dialog
  const [deletingCategory, setDeletingCategory] = React.useState<FlatCategoryItem | null>(null);

  const flatList = React.useMemo(() => flattenTree(categories), [categories]);

  const handleOpenCreate = (preselectedParentId?: string) => {
    setDialogMode('create');
    setEditingCategory(null);
    setFormName('');
    setFormSlug('');
    setFormParentId(preselectedParentId || 'none');
    setFormDescription('');
    setIsSlugManuallyEdited(false);
    setDialogError(null);
  };

  const handleOpenEdit = (item: FlatCategoryItem) => {
    setDialogMode('edit');
    setEditingCategory(item as unknown as Category);
    setFormName(item.name);
    setFormSlug(item.slug);
    setFormParentId(item.parentId || 'none');
    setFormDescription(item.description || '');
    setIsSlugManuallyEdited(true);
    setDialogError(null);
  };

  const handleCloseFormDialog = () => {
    setDialogMode(null);
    setEditingCategory(null);
    setDialogError(null);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormName(val);
    if (!isSlugManuallyEdited) {
      setFormSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    setFormSlug(slugify(e.target.value));
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setDialogError('Category name is required.');
      return;
    }
    if (!formSlug.trim()) {
      setDialogError('Valid category slug is required.');
      return;
    }

    setDialogError(null);
    const parentId = formParentId === 'none' ? null : formParentId;

    try {
      if (dialogMode === 'create') {
        await createCategoryMutation.mutateAsync({
          name: formName.trim(),
          slug: formSlug.trim(),
          parentId,
          description: formDescription.trim() ? formDescription.trim() : null,
        });
        toast.success('Category created', `Category "${formName.trim()}" has been created.`);
      } else if (dialogMode === 'edit' && editingCategory) {
        await updateCategoryMutation.mutateAsync({
          id: editingCategory.id,
          input: {
            name: formName.trim(),
            slug: formSlug.trim(),
            parentId,
            description: formDescription.trim() ? formDescription.trim() : null,
          },
        });
        toast.success('Category updated', `Category "${formName.trim()}" has been updated.`);
      }
      handleCloseFormDialog();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setDialogError(
            'A category with this URL slug already exists. Please pick a unique slug.',
          );
          toast.error('Slug conflict', 'A category with this URL slug already exists.');
          return;
        }
        if (err.status === 400) {
          setDialogError(err.message || 'Invalid category structure or cycle detected.');
          toast.error('Invalid category', err.message);
          return;
        }
        setDialogError(err.message || 'Failed to save category.');
        toast.error('Operation failed', err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setDialogError(msg);
        toast.error('Error', msg);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return;

    try {
      await deleteCategoryMutation.mutateAsync(deletingCategory.id);
      toast.success(
        'Category deleted',
        `Category "${deletingCategory.name}" was successfully removed.`,
      );
      setDeletingCategory(null);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast.error(
            'Cannot delete category',
            'Cannot delete this category because it has subcategories or active listings assigned to it.',
          );
          setDeletingCategory(null);
          return;
        }
        toast.error('Delete failed', err.message);
      } else {
        toast.error('Error', err instanceof Error ? err.message : 'Failed to delete category');
      }
      setDeletingCategory(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            Category Hierarchy
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize marketplace taxonomy, manage URLs, and oversee listing distributions.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => handleOpenCreate()}
          size="sm"
          className="text-xs self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Category
        </Button>
      </div>

      {/* Main Categories Card */}
      <Card className="shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading categories tree">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border/50"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-md" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <ErrorState
              title="Unable to Load Category Tree"
              message={
                error instanceof Error
                  ? error.message
                  : 'Failed to retrieve marketplace categories.'
              }
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          </div>
        ) : flatList.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={FolderTree}
              title="No Categories Yet"
              description="Create your first parent category to begin organizing listings."
              action={
                <Button size="sm" onClick={() => handleOpenCreate()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add First Category
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" aria-label="Categories hierarchy table">
              <thead className="bg-muted/70 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Category Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Slug
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Open Listings
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flatList.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`category-row-${item.id}`}
                  >
                    {/* Indented Name */}
                    <td className="px-4 py-3.5">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${item.depth * 20}px` }}
                      >
                        {item.hasChildren ? (
                          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-semibold text-foreground">{item.name}</span>
                        {item.depth > 0 && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded-xs">
                            sub
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Slug */}
                    <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">
                      /{item.slug}
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3.5 text-muted-foreground max-w-xs truncate">
                      {item.description || '—'}
                    </td>

                    {/* Listing Count */}
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {item.listingCount} listings
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenCreate(item.id)}
                          className="h-7 px-2 text-xs"
                          title="Add subcategory"
                          aria-label={`Add subcategory under ${item.name}`}
                        >
                          <FolderPlus className="h-3.5 w-3.5 mr-1" />
                          <span className="hidden sm:inline">Add sub</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(item)}
                          className="h-7 px-2 text-xs"
                          title="Edit category"
                          aria-label={`Edit category ${item.name}`}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingCategory(item)}
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          title="Delete category"
                          aria-label={`Delete category ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Dialog */}
      {dialogMode && (
        <Dialog
          open={Boolean(dialogMode)}
          onOpenChange={(open) => !open && handleCloseFormDialog()}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-primary" />
                {dialogMode === 'create' ? 'Create Category' : 'Edit Category'}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === 'create'
                  ? 'Add a new category or subcategory to the marketplace taxonomy.'
                  : `Modify settings for "${editingCategory?.name}".`}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                void handleSubmitForm(e);
              }}
              className="space-y-4 pt-2"
            >
              {dialogError && (
                <div
                  className="rounded-md bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{dialogError}</span>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="category-name-input">Category Name *</Label>
                <Input
                  id="category-name-input"
                  value={formName}
                  onChange={handleNameChange}
                  placeholder="e.g. Graphic Design"
                  className="text-xs"
                  required
                />
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category-slug-input">URL Slug *</Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    /categories/{formSlug || 'slug'}
                  </span>
                </div>
                <Input
                  id="category-slug-input"
                  value={formSlug}
                  onChange={handleSlugChange}
                  placeholder="e.g. graphic-design"
                  className="text-xs font-mono"
                  required
                />
              </div>

              {/* Parent Category */}
              <div className="space-y-1.5">
                <Label htmlFor="category-parent-select">Parent Category (Optional)</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger id="category-parent-select" className="w-full text-xs">
                    <SelectValue placeholder="None (Top level category)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Top-level Category)</SelectItem>
                    {flatList
                      // When editing, exclude self to prevent cycle
                      .filter((c) => !editingCategory || c.id !== editingCategory.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {'— '.repeat(c.depth)}
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="category-desc-input">Description (Optional)</Label>
                <Textarea
                  id="category-desc-input"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value.slice(0, 500))}
                  placeholder="Brief description for SEO and category page headers..."
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseFormDialog}
                  disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                  disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                >
                  {dialogMode === 'create' ? 'Create Category' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        title="Delete Category"
        description={
          deletingCategory ? (
            <span>
              Are you sure you want to delete category <strong>{deletingCategory.name}</strong> (/
              {deletingCategory.slug})? If this category has active listings or subcategories,
              deletion will be rejected.
            </span>
          ) : (
            ''
          )
        }
        confirmText="Delete Category"
        variant="destructive"
        isLoading={deleteCategoryMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
