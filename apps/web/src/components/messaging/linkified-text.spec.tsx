import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkifiedText } from './linkified-text';

describe('LinkifiedText', () => {
  it('renders plain text without links', () => {
    const { container } = render(<LinkifiedText text="Hello, this is a plain message." />);
    expect(container.textContent).toBe('Hello, this is a plain message.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders http and https links safely', () => {
    render(
      <LinkifiedText text="Check this out: https://example.com/test and http://market.test/item" />,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    expect(links[0]).toHaveAttribute('href', 'https://example.com/test');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');

    expect(links[1]).toHaveAttribute('href', 'http://market.test/item');
    expect(links[1]).toHaveAttribute('target', '_blank');
    expect(links[1]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does NOT linkify javascript: or dangerous pseudo-protocols', () => {
    render(<LinkifiedText text="Click here: javascript:alert(1) or data:text/html,hack" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
  });

  it('handles empty or null text safely', () => {
    const { container } = render(<LinkifiedText text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
