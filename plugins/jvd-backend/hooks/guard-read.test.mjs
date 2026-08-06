#!/usr/bin/env node
/**
 * Self-test for this plugin's copy of guard-read.mjs. Run from anywhere:
 *   node plugins/jvd-backend/hooks/guard-read.test.mjs
 *
 * The hook file is a byte-identical copy of the one in jvd-frontend — the guard
 * is stack-agnostic, but a plugin can only ship files inside its own directory,
 * so a backend-only project that enables jvd-backend alone would otherwise have
 * no guard at all. The duplication is the deliberate cost of that; see
 * CHANGELOG.md.
 *
 * The cases below are NOT a copy. They exercise the layout the frontend suite
 * never sees: Laravel at the repo root rather than under `backend/`, where
 * `storage/`, `bootstrap/cache/` and `vendor/` sit one segment from the top.
 *
 * No test runner: it shells out to the hook exactly the way Claude Code does
 * (JSON on stdin, exit code out), so it verifies the real contract rather than
 * an internal function.
 *
 * The two halves matter equally. BLOCK cases prove the hook still saves tokens;
 * ALLOW cases prove it never eats a real source file — a guard that blocks
 * source is far worse than no guard at all.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-read.mjs');

const BLOCK = [
  // Composer's tree, at both layouts
  'vendor/autoload.php',
  'vendor/laravel/framework/src/Illuminate/Support/Str.php',
  'backend/vendor/composer/installed.php',
  'composer.lock',
  'backend/composer.lock',
  // Laravel's own generated directories — at the repo root, which is the
  // layout a backend-only project has and the frontend suite never covers.
  'bootstrap/cache/config.php',
  'bootstrap/cache/packages.php',
  'storage/framework/views/1a2b3c.php',
  'storage/framework/cache/data/x',
  'storage/logs/laravel.log',
  'storage/debugbar/x.json',
  // build output that a Laravel repo still produces (Filament/Horizon assets)
  'public/build/assets/app-a1b2.js',
  'coverage/index.html',
  // binaries / media served from public/
  'public/favicon.ico',
  'public/storage/uploads/product-1.jpg',
  'database/database.sqlite',
  'docs/api-spec.pdf',
];

const ALLOW = [
  // ordinary backend source — the regression half
  'app/Http/Controllers/OrderController.php',
  'app/Http/Requests/Order/StoreOrderRequest.php',
  'app/Http/Resources/OrderResource.php',
  'app/Services/OrderService.php',
  'app/Models/Order.php',
  'app/Enums/RolesEnum.php',
  'app/Filament/Resources/Users/UserResource.php',
  'routes/api.php',
  'routes/auth.php',
  'bootstrap/app.php', // the file, not the bootstrap/cache/ directory beside it
  'config/sanctum.php',
  'database/migrations/2026_01_01_000000_create_orders_table.php',
  'database/seeders/DatabaseSeeder.php',
  'database/factories/OrderFactory.php',
  'tests/Feature/OrderTest.php',
  'lang/uk/crud.php',
  'composer.json', // the manifest is useful; only the LOCK is noise
  'phpstan.neon',
  'phpunit.xml',
  'backend/AGENTS.md',
  // names that merely CONTAIN a blocked word must not trip it
  'app/Services/VendorService.php',
  'app/Models/Vendor.php',
  'app/Http/Controllers/BuildController.php',
  'app/Console/Commands/CacheWarmCommand.php',
  'database/migrations/2026_02_02_000000_add_storage_path_to_products.php',
];

const run = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
    .status;

const readEvent = (filePath) => ({ tool_name: 'Read', tool_input: { file_path: filePath } });

const failures = [];

for (const filePath of BLOCK) {
  if (run(readEvent(filePath)) !== 2) failures.push(`  should BLOCK but allowed: ${filePath}`);
}
for (const filePath of ALLOW) {
  if (run(readEvent(filePath)) !== 0) failures.push(`  should ALLOW but blocked: ${filePath}`);
}

// A non-Read tool must always pass through untouched.
if (run({ tool_name: 'Edit', tool_input: { file_path: 'vendor/autoload.php' } }) !== 0) {
  failures.push('  should ignore non-Read tools, but blocked an Edit');
}

// Malformed input must fail open, not block.
if (spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' }).status !== 0) {
  failures.push('  should fail open on malformed input, but blocked');
}

const total = BLOCK.length + ALLOW.length + 2;
if (failures.length > 0) {
  console.error(`FAIL - ${failures.length}/${total} cases wrong:`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `ok - ${total}/${total} guard-read cases pass ` +
    `(${BLOCK.length} block, ${ALLOW.length} allow, 2 contract)`,
);
