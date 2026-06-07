const SHARED_RULES = `Shared agent rules:
- Read all relevant files before making any changes.
- Never make speculative edits.
- Report every file touched.
- End with a one-line plain-text summary.
- Always follow PSR-12 for PHP. Use PHP 8.3+ features where applicable (readonly, enums, match, named args, constructor promotion).
- Prefer Laravel conventions over custom solutions. Never reinvent what the framework already provides.`;

const CONTRACT_RULES = `
## Data contract rules (apply to every agent that touches controllers OR Vue pages)
- Before writing a controller method, decide the exact prop shape it will pass to Inertia::render().
- Before writing a Vue page, confirm the prop shape from the controller.
- These must match exactly. Mismatches cause "Cannot read properties of undefined" at runtime.
- Document the contract as a comment at the top of each Vue page:
    // CONTRACT: { products: LengthAwarePaginator<Product>, filters: { search: string } }
- Paginated Eloquent results passed via Inertia arrive as a plain object with keys:
    { data: Product[], links: [], meta: { current_page, last_page, total, ... } }
  Always use defineProps({ products: Object }) for paginated results — not Array.
- Single model results arrive as a plain object: defineProps({ product: Object }).
- Never pass an entire Eloquent collection when only a subset of fields is needed.
  Use ->only() on resources or select() on queries.
`;

const AGENTS = {
  simplify: {
    needsArgument: true,
    description: 'simplify the target without changing behavior',
    instruction: (target) => `Run the @simplify agent on: ${target}

Read the target file fully. For PHP/Laravel files:
- Replace verbose conditionals with match expressions or ternaries
- Use constructor promotion, readonly properties, named arguments
- Collapse repetitive Eloquent queries using scopes or helper methods
- Remove dead code, unused imports (use statements), commented-out blocks
- Replace manual DB queries with Eloquent equivalents where cleaner
- Use Laravel collection methods (map, filter, pluck, first) instead of loops

For Vue 3 files:
- Convert Options API to Composition API + <script setup> if present
- Extract repeated logic into composables (use*.js)
- Replace verbose v-bind/v-on with shorthand (: and @)
- Remove redundant ref/reactive wrappers
- Use computed() instead of methods that derive values

Rewrite WITHOUT changing behavior. Preserve all exports, function signatures, and component props.
Report each change as "✓ Removed/Replaced X (reason)".
End with exactly: "Simplified [file]: N changes, logic unchanged."`,
  },

  review: {
    needsArgument: true,
    description: 'audit the target for bugs, security, performance, style, and structure',
    instruction: (target) => `Run the @review agent on: ${target}

Read the target file fully. Audit across these categories:

[PHP/Laravel specific]
- [security] Mass assignment: check $fillable/$guarded on all models. Unvalidated input passed to DB queries.
- [security] Missing FormRequest validation — raw $request->all() or $request->input() in controllers.
- [security] SQL injection via raw DB::statement or whereRaw without bindings.
- [security] Exposed .env values, hardcoded credentials or API keys.
- [security] Missing policy/gate checks before model operations.
- [performance] N+1 queries — loops calling ->relation without eager loading (with()).
- [performance] Missing database indexes on frequently filtered/sorted columns.
- [performance] Queries inside view templates or Blade files.
- [performance] Missing cache (Cache::remember) on heavy or repeated queries.
- [structure] Fat controllers — business logic that belongs in a Service class.
- [structure] Validation logic inside controllers instead of FormRequest classes.
- [structure] Missing try/catch around external API calls or file operations.
- [style] Unused use statements, magic numbers, commented-out code.
- [bugs] Off-by-one errors in pagination, unhandled null Eloquent results (->firstOrFail() vs ->first()).

[Vue 3 specific]
- [bugs] Missing v-key on v-for loops causing rendering issues.
- [bugs] Mutating props directly instead of emitting events.
- [bugs] Async operations without error handling in onMounted or composables.
- [performance] Heavy computations in templates instead of computed().
- [performance] Unnecessary watchers when computed() would suffice.
- [security] v-html with unsanitized user content (XSS risk).
- [structure] Business logic or API calls directly in components instead of composables or Pinia stores.
- [structure] Pinia store doing too much — should be split by domain.

Do not edit files; report findings only.
Format each finding as "[severity: low|medium|high] category — finding — fix".
End with exactly: "Review score: X/10 — verdict."`,
  },

  hunt: {
    needsArgument: true,
    description: 'trace the broken behavior to a verified root cause and fix it',
    instruction: (target) => `Run the @hunt agent for: ${target}

Follow the full call chain: routes → middleware → controller → FormRequest → service → model → migration.
For Vue 3: trace from component → composable → Pinia store → API call → Laravel route.

State "Hypothesis: [cause]" before touching anything.
Verify by reading the exact code path — check:
- Eloquent relationships defined correctly (foreign keys match migration columns)
- Route model binding and parameter names match
- FormRequest rules not silently failing due to wrong field names
- Inertia props mismatch between controller and component defineProps()
- Pinia store state not reset between page visits (Inertia keep-alive issue)
- CSRF token missing or expired in form submissions
- Queue jobs silently failing (check failed_jobs table and horizon)

Never apply a speculative fix. Only fix what you can trace to root cause.
End with exactly: "✓ Bug fixed: [what] in [file]:[line]."`,
  },

  fix: {
    needsArgument: true,
    description: 'fix only the exact reported error',
    instruction: (target) => `Run the @fix agent for: ${target}

Read the exact file and line referenced in the error. For common Laravel errors:
- "Class not found" → check namespace, PSR-4 in composer.json, run composer dump-autoload
- "Column not found" → check migration vs $fillable, run php artisan migrate:status
- "Method not allowed" → check route verb matches form method or @method spoofing
- "CSRF token mismatch" → add @csrf to form or X-CSRF-TOKEN header in axios
- "419 Page Expired" → SESSION_DOMAIN or cookie config issue
- "Attempt to read property on null" → missing ->firstOrFail() or null check before relation access

For Vue 3 / Inertia errors:
- "Cannot read properties of undefined" → check defineProps() matches controller's Inertia::render() keys
- "Hydration mismatch" → server vs client prop mismatch in SSR setup
- "[Vue warn] Missing required prop" → check parent is passing the prop correctly

Fix only that specific error, nothing more.
End with exactly: "✓ Fixed: [error] in [file]:[line]."`,
  },

  test: {
    needsArgument: true,
    description: "add focused tests using the project's existing conventions",
    instruction: (target) => `Run the @test agent on: ${target}

Read the target file fully before writing any test.
Detect the test framework from composer.json (Pest is Laravel 11+ default; PHPUnit otherwise).
Match existing test naming conventions and folder structure (tests/Feature vs tests/Unit).

For Laravel (Pest preferred):
- Feature tests: use RefreshDatabase, actingAs(), withoutExceptionHandling() for routes and controllers
- Test FormRequest validation rules with valid and invalid payloads
- Test Eloquent model scopes and relationships in isolation
- Use mock() or Http::fake() for external API calls — never hit real services in tests
- Assert database state with assertDatabaseHas(), assertDatabaseMissing()
- Test queue jobs with Queue::fake() and assertPushed()
- Test authorization: assert guests are redirected, unauthorized users get 403

For Vue 3 (Vitest + Vue Test Utils):
- Test component renders correctly with given props
- Test emitted events on user interaction
- Test Pinia store actions and state changes in isolation
- Mock API calls with vi.mock() or msw
- Test composables by calling them inside a test component wrapper

Cover: happy path, edge cases, validation errors, authorization failures, and boundary values.`,
  },

  commit: {
    needsArgument: false,
    description: 'inspect changes and prepare a conventional commit',
    instruction: () => `Run the @commit agent.

Run git diff --cached to read staged changes. If nothing is staged, run git diff and tell the user to stage first.
Write a conventional commit message: type(scope): description.

Allowed types: feat | fix | refactor | style | test | docs | chore | migration | security
Laravel-specific scopes: model, controller, migration, service, policy, request, job, event, listener, command, route, config, seeder

Keep the subject under 72 characters, imperative mood.
If the diff touches a migration, always include it in the same commit as the model change.
If the diff includes .env.example changes, confirm no real secrets were accidentally staged.
If the diff covers multiple concerns, suggest splitting into atomic commits.
Wait for user confirmation before committing.`,
  },

  migrate: {
    needsArgument: true,
    description: 'create or audit a Laravel migration for a model change',
    instruction: (target) => `Run the @migrate agent on: ${target}

Read the existing migration files and the model's $fillable, $casts, and relationships.
For a NEW migration:
- Name it descriptively: create_products_table, add_status_to_orders_table, etc.
- Use correct column types: unsignedBigInteger for FKs, string(255) default, text for long content, decimal(10,2) for prices
- Always add foreign key constraints with ->constrained()->cascadeOnDelete() where appropriate
- Add indexes on columns used in WHERE, ORDER BY, or JOIN (->index())
- Use softDeletes() if the model uses SoftDeletes trait
- Never use $table->timestamps() AND explicit created_at/updated_at — pick one

For AUDITING an existing migration:
- Check that every column in $fillable exists in the migration
- Check that $casts types match column types (bool cast → tinyInteger, decimal cast → decimal)
- Flag missing indexes on foreign keys
- Flag missing nullable() on optional columns

End with exactly: "✓ Migration [filename]: N columns, [issues found or 'no issues']."`,
  },

  artisan: {
    needsArgument: true,
    description: 'scaffold Laravel files using the correct artisan make: commands',
    instruction: (target) => `Run the @artisan agent for: ${target}

Determine the correct artisan command(s) to scaffold what is being requested.
Common commands to consider:
  php artisan make:model Product -mfsc
  php artisan make:controller ProductController --resource --model=Product
  php artisan make:request StoreProductRequest
  php artisan make:resource ProductResource
  php artisan make:policy ProductPolicy --model=Product
  php artisan make:job ProcessOrder
  php artisan make:event OrderShipped
  php artisan make:listener SendOrderNotification --event=OrderShipped
  php artisan make:mail OrderConfirmation --markdown
  php artisan make:command GenerateMonthlyReport
  php artisan make:middleware EnsureEmailIsVerified

Run the command(s) in order. After scaffolding, open each generated file and:
- Fill in the $fillable array on models
- Add authorization logic to policies
- Add validation rules to FormRequests
- Wire up the route in routes/web.php or routes/api.php

End with exactly: "✓ Scaffolded: [list of files created]."`,
  },

  scaffold: {
    needsArgument: true,
    description: 'scaffold a fresh Laravel + Vue 3 + Inertia + Tailwind project, then build the requested feature',
    instruction: (target) => `Run the @scaffold agent for: ${target}

You must complete every numbered step in order. Do not skip any step. Do not print the done summary until Step 8 passes.

━━━ PHASE 1: INSTALL ━━━

Step 1 — Check if Laravel is already installed.
  Action: run list_files on the cwd.
  If composer.json AND artisan are both present → skip to Step 3.
  If either is missing → continue to Step 2.

Step 2 — Install Laravel.
  Action: run_command → composer create-project laravel/laravel .
  Then run: php artisan --version
  If the command fails, report the exact error and stop. Do not continue.
  ✓ checkpoint: artisan is now present in cwd.

━━━ PHASE 2: FRONTEND STACK ━━━

Step 3 — Install PHP dependencies for Inertia.
  Action: run_command → composer require inertiajs/inertia-laravel
  Then run: composer show inertiajs/inertia-laravel to confirm it installed.

Step 4 — Publish and register Inertia middleware.
  Action: run_command → php artisan inertia:middleware
  Read bootstrap/app.php and register HandleInertiaRequests in the web middleware append list.
  For Laravel 10, read app/Http/Kernel.php and append it to $middlewareGroups['web'].

Step 5 — Install JS dependencies.
  Action: run_command → npm install @inertiajs/vue3 vue @vitejs/plugin-vue tailwindcss @tailwindcss/forms autoprefixer postcss
  ✓ checkpoint: node_modules/ directory exists.

Step 6 — Write and verify every frontend stack file:
  - vite.config.js with laravel-vite-plugin, @vitejs/plugin-vue, resources/js/app.js, and @ alias
  - tailwind.config.js with Blade, JS, and Vue content paths plus @tailwindcss/forms
  - postcss.config.js with tailwindcss and autoprefixer
  - resources/css/app.css with Tailwind base, components, and utilities
  - resources/views/app.blade.php as the Inertia root with @vite, @inertiaHead, and @inertia
  - resources/js/app.js using createInertiaApp and resolving ./Pages/\${name}.vue
  Run list_files and do not continue until all six files exist.

━━━ PHASE 3: FEATURE BUILD ━━━

Step 7 — Build the feature: ${target}
  7A — Route: read routes/web.php, add a named route using Inertia::render('PageName'), and ensure PageName matches the Vue file.
  7B — Vue page: create resources/js/Pages/[PageName].vue with real content and Tailwind classes.
    It MUST contain <script setup> and, in order:
    1. <nav> with logo and links
    2. <main> with hero, features, products/categories, and CTA sections
    3. <footer> with link columns and copyright
    Include at least 3 feature cards and 4 product/category cards. Do not use lorem ipsum.
  7C — Run list_files on resources/js/Pages/ and confirm the page exists.

Step 8 — Build check.
  Action: run_command → npm run build
  If it fails, read the error, fix it, and re-run. Do not print the done summary until it exits with code 0.

Only after Step 8 passes, print exactly:
"✓ Scaffolded [feature name]: [N] files created, ready at [route path]."
Then list every file created or edited, one per line, as "  + path/to/file".`,
  },

  feature: {
    needsArgument: true,
    description: 'build a complete Laravel + Vue 3 feature: migration, model, controller, routes, and all dynamic Inertia pages',
    instruction: (target) => `Run the @feature agent for: ${target}

You are building one complete vertical feature slice end-to-end. Every layer must be consistent with every other layer. Do not finish until all checkpoints pass.

━━━ PRE-FLIGHT ━━━
Step 0 — Read the project before touching anything.
  Confirm artisan and composer.json; read composer.json, routes/web.php, app/Models/, resources/js/Pages/, and any existing model or migration for this feature.

━━━ PHASE 1: DATA LAYER ━━━
Step 1 — Define and print both contracts before writing files:
  MODEL CONTRACT: model, table, columns/types, $fillable, $casts, relationships, soft deletes.
  INERTIA PROP CONTRACT: exact props passed by index(), show(), create(), and edit().

Step 2 — Generate and complete the migration with php artisan make:migration create_[table]_table.
  Use decimal(10, 2) for money, constrained foreign IDs, indexes for queried columns, nullable optional columns, optional softDeletes(), timestamps(), and Schema::dropIfExists().

Step 3 — Generate and complete the model with php artisan make:model [Model].
  Add $fillable, $casts, relationships, optional SoftDeletes, and required local scopes.

Step 4 — Generate Store[Model]Request and Update[Model]Request.
  Implement authorize() and rules() for every fillable field. Update rules must support partial updates with sometimes.

Step 5 — Generate [Model]Resource and implement toArray() with only required fields, formatted money, whenLoaded() relationships, id, and created_at.

Step 6 — Run php artisan migrate. Fix failures and re-run until it exits 0.

━━━ PHASE 2: CONTROLLER ━━━
Step 7 — Generate [Model]Controller --resource --model=[Model] and implement all 7 methods.
  Follow the INERTIA PROP CONTRACT exactly. Use Store[Model]Request and Update[Model]Request, $request->validated(), eager loading, pagination, resources, and named-route redirects. Never use $request->all().

━━━ PHASE 3: ROUTES ━━━
Step 8 — Read routes/web.php, register Route::resource with appropriate middleware, then run php artisan route:list --name=[model] and confirm all 7 resource routes.

━━━ PHASE 4: VUE PAGES ━━━
Before writing each Vue file, re-read the INERTIA PROP CONTRACT. Every defineProps() key must exactly match its controller response.

Step 9 — Create Index.vue with:
  // CONTRACT: { items: LengthAwarePaginator<[Model]>, filters: { search } }
  Search, New button, flash message, item table/card grid, Edit/Delete controls, pagination using items.links, and empty state.

Step 10 — Create Create.vue with useForm(), one styled input and error per fillable field, processing state, submit, and cancel.

Step 11 — Create Edit.vue with the same fields pre-populated from item and form.patch().

Step 12 — Create Show.vue with:
  // CONTRACT: { item: [Model] }
  A detail card plus Edit, Back, and confirmed Delete controls.

Step 13 — Run list_files on resources/js/Pages/[Model]/.
  Required: Index.vue, Create.vue, Edit.vue, Show.vue. Create any missing page before continuing.

━━━ PHASE 5: VERIFY ━━━
Step 14 — Run npm run build. Fix failures and re-run until it exits 0.
Step 15 — Run php artisan route:list --name=[model], confirm all 7 routes, and verify every Vue defineProps key and form route against the controller and route list.

Only after Steps 14 and 15 pass, print exactly:
"✓ Feature [[Model]]: [N] files created, routes registered, build passing."
Then list every file, one per line: "  + path/to/file  [what it does]"`,
  },

  component: {
    needsArgument: true,
    description: 'create or refactor a Vue 3 component following Composition API best practices',
    instruction: (target) => `Run the @component agent on: ${target}

Read all related files: parent component, existing composables, Pinia stores, and the Inertia controller if applicable.

When CREATING a new component:
- Always use <script setup> with Composition API (never Options API)
- Use defineProps() with runtime type declarations and defaults
- Use defineEmits() for all events — never mutate props
- Extract logic >20 lines into a composable: resources/js/composables/use[Name].js
- Use Pinia for cross-component state; use props/emits for parent-child
- Apply Tailwind utility classes only — no inline styles, no custom CSS unless unavoidable
- Use v-bind="$attrs" on root element if the component is a wrapper
- Add :key on all v-for loops using a stable unique ID

When REFACTORING an existing component:
- Convert Options API to <script setup> if present
- Move API calls from onMounted into a composable
- Replace Vuex store usage with Pinia equivalents
- Replace hard-coded class strings with dynamic :class bindings where logic applies

End with exactly: "✓ Component [name]: [created|refactored], [N composables extracted]."`,
  },
};

export const AGENT_COMMANDS = [
  ['@simplify', 'simplify PHP/Vue code without changing behavior'],
  ['@review', 'audit Laravel/Vue code for bugs, security, N+1, and structure'],
  ['@hunt', 'trace and fix a verified root cause across the full stack'],
  ['@fix', 'fix one specific Laravel or Vue error'],
  ['@test', 'add Pest feature tests or Vitest component tests'],
  ['@commit', 'prepare a conventional commit with Laravel-aware scopes'],
  ['@migrate', 'create or audit a Laravel migration'],
  ['@artisan', 'scaffold Laravel files with the correct artisan commands'],
  ['@scaffold', 'create a fresh Laravel + Vue 3 + Inertia + Tailwind project and build the requested feature'],
  ['@feature', 'build a complete feature: migration, model, controller, routes, and all dynamic Inertia pages'],
  ['@component', 'create or refactor a Vue 3 Composition API component'],
];

export function routeAgentInput(input) {
  const match = input.match(/^@([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return { matched: false, input };

  const name = match[1].toLowerCase();
  const agent = AGENTS[name];
  if (!agent) return { matched: false, input };

  const argument = (match[2] || '').trim();
  if (agent.needsArgument && !argument) {
    return { matched: true, error: `@${name} requires a file, error, or description.` };
  }

  return {
    matched: true,
    announcement: `◆ @${name} dispatched — ${agent.description}`,
    input: `${agent.instruction(argument)}\n\n${CONTRACT_RULES}\n\n${SHARED_RULES}`,
  };
}
