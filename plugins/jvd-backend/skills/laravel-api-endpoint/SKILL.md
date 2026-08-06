---
name: laravel-api-endpoint
description: "Adds or changes a backend API endpoint, controller, route, role guard, or server-side translation string. Activates on work in backend/, or when the user mentions Laravel, artisan, controller, route, middleware, Sanctum, Filament, or lang/ translations."
---

# Laravel API endpoint (backend/)

Stack facts and known traps are in the project's own `backend/AGENTS.md` — this
skill ships from the `jvd-soft` marketplace and describes the shared stack, so
it never links into a project tree. This is the how-to for the one task that
comes up most: adding an endpoint.

## 1. Thin controller on the abstract base class

`App\Http\Controllers\Controller` is `abstract` and exists **only** to supply the
response envelope. Every API controller extends it and returns through its
helpers — never `response()->json()` directly.

The controller takes validated input, calls **one** service method, wraps the
result in a resource and returns the envelope. No queries and no domain
branching in the controller body:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\Order\StoreOrderRequest;
use App\Http\Resources\OrderResource;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;

class OrderController extends Controller
{
    public function __construct(private readonly OrderService $orders) {}

    public function index(): JsonResponse
    {
        return $this->successPaginated(
            $this->orders->paginate(),
            OrderResource::class,
            __('crud.fetched', ['entity' => __('entity.order')]),
        );
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        return $this->success(
            new OrderResource($this->orders->create($request->validated())),
            __('crud.created', ['entity' => __('entity.order')]),
            201,
        );
    }
}
```

The service holds the Eloquent work and returns **domain values** — a model, a
paginator, a bool — never a `JsonResponse` and never a resource:

```php
namespace App\Services;

use App\Models\Order;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class OrderService
{
    public function paginate(): LengthAwarePaginator
    {
        return Order::query()->paginate();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Order
    {
        return Order::create($data);
    }
}
```

Injection is constructor-only — the container resolves it, no `new` and no
facade. `app/Services/` may not exist yet in a fresh copy; create it here.

**Validation lives in a FormRequest**, never in the controller body — one style
across the app, and Scramble reads `rules()` for the OpenAPI docs:

```php
namespace App\Http\Requests\Order;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
        ];
    }
}
```

**Keep the class exactly that shape — no comments, no docblocks, nothing else.**
`authorize()`, `rules()`, array-form rules, done. `App\Http\Requests\Auth\*` are
the worked examples and every one of them is this short. Add `messages()` or
`prepareForValidation()` only when the endpoint actually needs them.

This is the general rule in `backend/`, not a FormRequest quirk: **no
explanatory comments anywhere** — controllers, models, migrations, seeders,
routes, tests included. Keep only the docblocks PHPStan reads (`@return
array<string, mixed>`, `@param Builder<City>`, `@mixin`, `@extends`,
`@property`). A rule worth justifying gets a test named after what it protects,
not a paragraph that goes stale the first time someone edits the line below it.

**A list goes through `successPaginated()`**, which emits
`data: { items, meta: { current_page, last_page, per_page, total } }`. Handing a
paginator to `success()` instead splices Laravel's own `data`/`links`/`path`
keys into ours and every list unpacks differently on the frontend.

**The model goes through a resource, never straight into `success()`.** `$hidden`
is a denylist and leaks anything nobody remembered to add to it — copy
`app/Http/Resources/UserResource.php` and list the exposed fields explicitly.
Auto-wrapping is off globally (`JsonResource::withoutWrapping()`), so a resource
adds no second `data` layer of its own.

Emitted shapes:

```jsonc
// $this->success($data, $message, $code = 200)
{ "status": "success", "message": "…", "data": … }

// $this->error($message, $code = 400, $details = [])
{ "status": "error",   "message": "…", "errors": … }
```

Keep to the resource verbs listed in the base class docblock —
`index / store / show / update / destroy` — when the action fits one.

## 2. Don't hand-roll error responses

`bootstrap/app.php` → `withExceptions()` already renders, in the same envelope:

| Thrown | Status | Body message |
|---|---|---|
| `ValidationException` | 422 | `crud.validation_failed` + `errors` map |
| `NotFoundHttpException` | 404 | `crud.not_found` |
| `AccessDeniedHttpException` | 403 | `crud.forbidden` |
| any `Throwable` (only when `APP_DEBUG=false`) | 500 | `crud.server_error` |

So FormRequest rules and route-model binding produce correct JSON with no
try/catch in the controller. `$this->error()` is for *domain* failures the
framework can't infer. A new global rule goes in `withExceptions()`, not in a
controller.

## 3. Every string goes through `__()`

No literal user-facing text in controllers, middleware or notifications.

```php
__('crud.updated', ['entity' => __('entity.order')])   // compose, don't write sentences
```

- `crud.php` — generic outcomes, all `:entity`-interpolated.
- `entity.php` — entity display names (`resource`, `user`). A new model usually
  needs its name added here before `crud.php` can interpolate it.
- `messages.php` — app-specific one-offs.
- `auth.php` — the auth-flow messages `AuthController` returns.

Add the key to **every** `lang/<locale>/` directory in the same change — today
`lang/en/` and `lang/uk/`. A missing key renders as the literal key string at
runtime, silently: no exception, no log line, no failing test.

Do not assume the locales currently match. They drift, and file-level drift is
the common shape — a whole file translated in one locale and never in the other.
This plugin's `SessionStart` hook reports that gap at the top of the session,
and `jvd-backend-test-writer` carries a parity test that catches it at the key
level, which is the only thing that catches it for good.

Locale comes from the `Accept-Language` header via `SetLocaleMiddleware`, an
exact match against its `LOCALES` allowlist (`en`, `uk`). Adding a language
means a new `lang/<code>/` directory **and** a line in that constant — a locale
listed without its directory silently falls back to `en`.

## 4. Wire the route with the role guard

```php
use App\Enums\RolesEnum;

Route::middleware('auth:sanctum')->group(function () {
    Route::middleware(['role:' . RolesEnum::Admin->value, 'verified'])->group(function () {
        Route::apiResource('orders', OrderController::class);
    });
});
```

- Feature routes → `routes/api.php`; auth-adjacent → `routes/auth.php` (it is
  `require`d from `api.php`, so both are served under `/api`).
- If the route is reachable **without** `auth:sanctum`, it needs a `throttle:`.
  The unauthenticated auth endpoints share a `throttle:6,1` group in
  `routes/auth.php` — put a new public route there, or give it its own limit.
- `role:` compares **numeric levels** (`owner` 3 > `admin` 2 > `user` 1), so
  `role:user` means "user or above". Widen access by changing the level, not by
  stacking checks.
- Always `RolesEnum::X->value`, never the bare string.
- Scramble picks the route up for `/docs/api` automatically — explicit return
  types and FormRequest `rules()` are what it reads, so keep them.

## 5. Verify

```bash
php artisan route:list --path=orders   # route resolves to a class that exists
php artisan test --filter=OrderTest    # write the test — it is the only signal
./vendor/bin/pint app/Http/Controllers/OrderController.php app/Services/OrderService.php
composer analyse                       # must be green; run it in the container
```

`/jvd-backend:check` runs all three in the container in one go.

The three do not carry the same weight. `pint --test` has a pre-existing
backlog, so a failure there is only yours if it names a file you touched — and
don't reformat the whole tree in a feature diff to clear it. The suite's
coverage varies by project and by area; the project's `backend/AGENTS.md` states
where it actually stands. Either way **your new test is the signal on your
change** — report the tests *you* ran, not that the suite was green.

`composer analyse` (PHPStan level 5 + Larastan, **container only** — from the
host it silently checks nothing) is green, so any error there is yours.

`route:list` is the cheap check that catches this stack's recurring failure
mode: a route referencing a controller class nobody created.
