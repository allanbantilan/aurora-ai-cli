const SHARED_RULES = `Shared agent rules:
- Read all relevant files before making any changes.
- Never make speculative edits.
- Report every file touched.
- End with a one-line plain-text summary.
- Always follow PSR-12 for PHP. Use PHP 8.3+ features where applicable (readonly, enums, match, named args, constructor promotion).
- Prefer Laravel conventions over custom solutions. Never reinvent what the framework already provides.`;

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
    input: `${agent.instruction(argument)}\n\n${SHARED_RULES}`,
  };
}
