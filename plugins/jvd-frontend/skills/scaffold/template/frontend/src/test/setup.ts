import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals` is off, so RTL's automatic cleanup never fires — call it here.
// `noUncheckedIndexedAccess` types `getAllByRole(...)[1]` as `T | undefined`:
// use `.at(i)` with an explicit assertion, don't relax the compiler flag.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
