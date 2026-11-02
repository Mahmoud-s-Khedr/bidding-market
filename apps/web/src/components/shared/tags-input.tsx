import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface TagsInputProps {
  value?: string[];
  onChange?: (tags: string[]) => void;
  maxTags?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

export function TagsInput({
  value = [],
  onChange,
  maxTags = 10,
  placeholder = 'Add tag and press Enter...',
  disabled = false,
  error = false,
  id,
  className,
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addTag = (rawTag: string) => {
    const trimmed = rawTag.trim().toLowerCase();
    if (!trimmed) return;
    if (value.length >= maxTags) return;
    if (value.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange?.([...value, trimmed]);
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    if (disabled) return;
    onChange?.(value.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]!);
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        error && 'border-destructive focus-within:ring-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 px-2 py-0.5 text-xs font-normal"
        >
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              aria-label={`Remove tag ${tag}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      {value.length < maxTags && (
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addTag(inputValue);
            }
          }}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-describedby={ariaDescribedby}
          aria-invalid={ariaInvalid}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-foreground text-sm"
        />
      )}
    </div>
  );
}
