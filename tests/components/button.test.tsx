import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button component', () => {
  it('renders button with label and responds to clicks', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables button when loading is true', () => {
    render(<Button loading>Loading State</Button>);

    const button = screen.getByRole('button', { name: /loading state/i });
    expect(button).toBeDisabled();
  });
});

// CI verification only (no behaviour change): gives GitHub Actions a commit to run against main at 355b29f.
