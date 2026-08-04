---
name: react-data-fetching
description: "Fetches or mutates server state in the frontend app. Activates when adding an API call, a new endpoint integration, a loading/error state for data, pagination, cache invalidation, or when the user mentions TanStack Query, useQuery, useMutation, Axios, or an API service."
---

# React Data Fetching (TanStack Query + Axios)

## When to apply

- Adding a new API call or wiring a component to backend data.
- Handling loading/error/empty states for server data.
- Invalidating or refetching data after a mutation.

## Never do this

```tsx
// Bad — manual fetch + useState/useEffect for server state
useEffect(() => {
  axios.get('/admin/stats').then((r) => setStats(r.data));
}, []);
```

TanStack Query already owns caching, retries, loading/error state, and
refetch-on-focus. Reimplementing it with `useState`/`useEffect` throws that away
and is the #1 thing to flag in review here.

## Pattern

1. One service file per resource under `src/api/services/`, using the shared
   `apiClient` from `src/api/apiClient.ts` — one axios instance for the whole
   app, don't create a second one. (`dashboard.service.ts` is currently the only
   example; match its naming.) Auth headers and 401 handling already live
   in its interceptors — see "Auth tokens" below. Type each call with the
   envelope, `ApiEnvelope<T>` from `@/api/types` — without the generic every
   `response.data` is `any` and the type-aware lint rules reject it:

```ts
// src/api/services/orders.service.ts
import apiClient from '@/api/apiClient';
import type { ApiEnvelope } from '@/api/types';

export interface Order {
  id: number;
  status: string;
}

export const OrdersService = {
  list: async (params?: Record<string, string>): Promise<ApiEnvelope<Order[]>> =>
    (await apiClient.get<ApiEnvelope<Order[]>>('/orders', { params })).data,
  create: async (payload: Partial<Order>): Promise<ApiEnvelope<Order>> =>
    (await apiClient.post<ApiEnvelope<Order>>('/orders', payload)).data,
};
```

2. Wrap it in a query/mutation hook — don't call the service directly from a component:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OrdersService } from '@/api/services/orders.service';

export function useOrders(params) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => OrdersService.list(params),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: OrdersService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}
```

## Query key convention

`[resourceName, ...paramsThatAffectTheResult]` — e.g. `['orders', { status: 'open' }]`.
Keep the resource name as the first element consistently so
`invalidateQueries({ queryKey: ['orders'] })` catches every variant.

## Auth tokens

Both interceptors in `src/api/apiClient.ts` are real; neither needs touching to
add an endpoint:

- **Request** — reads the Bearer token and sets `Authorization` on every
  outgoing call. Nothing else attaches that header, so a service or component
  never has to.
- **Response** — a 401 hands off to the callback registered via
  `setUnauthorizedHandler()`, which `AuthProvider` uses to tear down the
  session. Tokens expire after 120 minutes, so treat 401 as something that can
  happen on any call — never write per-call 401 handling in a component or
  service. Other statuses are still per-call.

The token lives in `localStorage` under `token`, reachable only through
`getStoredToken` / `setStoredToken` / `clearStoredToken`, exported from
`apiClient.ts`. Use those — don't read or write that key directly, and don't
set `apiClient.defaults.headers`; a default header survives a logout in another
tab, the interceptor doesn't.

`AuthProvider` owns *when* the token is stored and cleared (login, register,
Google callback, logout, failed `/user` check, 401). Auth behaviour changes go
there. `withCredentials` is never set — this is Bearer-token auth, not Sanctum
cookie auth.
