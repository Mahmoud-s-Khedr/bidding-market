import * as React from 'react';

// Regex strictly matching http:// and https:// URLs, avoiding punctuation at the end
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

export interface LinkifiedTextProps {
  text: string;
  className?: string;
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  if (!text) return null;

  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        // If it starts with http:// or https://, render as safe anchor
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-inherit hover:opacity-80 break-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
}
