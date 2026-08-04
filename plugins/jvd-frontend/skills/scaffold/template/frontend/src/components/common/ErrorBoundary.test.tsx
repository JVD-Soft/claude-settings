import '@/i18n';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

// Flipped by the test, not by the component. React retries a failed render
// synchronously before committing the error, so anything that heals itself on
// the second attempt never reaches the fallback at all.
let shouldThrow = true;

const Toggleable = () => {
  if (shouldThrow) throw new Error('transient');
  return <p>recovered</p>;
};

beforeEach(() => {
  shouldThrow = true;
  // React logs the caught error itself; the test asserts on the fallback, not
  // on console noise.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows a fallback instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('recovers when the retry button clears the error', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Toggleable />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a reload, not a retry, for a chunk left behind by a deploy', () => {
    // Retrying the render cannot bring back a hashed file that no longer
    // exists on the server — only a reload can.
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/x-abc123.js" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
