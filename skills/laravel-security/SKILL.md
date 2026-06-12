---
name: laravel-security
description: Secure Laravel applications with validation, authorization, policies, mass-assignment protection, XSS and CSRF defenses, and secret handling.
implicit: true
---

# Laravel Security

## Validation
- Always validate input: use FormRequest classes, never `$request->all()`
- Validate on the server even if client-side validation exists
- Use `required`, `string`, `email`, `max:255`, `unique:table,column` rules
- Use `sometimes()` for conditional validation
- Return validation errors in JSON for API endpoints

## Authorization
- Use policies for model-level access control
- Register policies via auto-discovery or AuthServiceProvider
- Use `$this->authorize('update', $product)` in controllers
- Use `Gate::forUser($admin)->allows('delete', $post)` for impersonation
- Always check ownership: `$model->user_id === auth()->id()`

## Mass Assignment Protection
- Define `$fillable` or `$guarded` on every model
- Never use `$request->all()` in `create()` or `update()`
- Use `$request->validated()` with FormRequest
- Use `$guarded = []` only when explicitly intentional

## XSS Prevention
- Escape output: `{{ $variable }}` in Blade, `v-text` in Vue
- Use `@json()` for safe JSON embedding
- Sanitize user input before display
- Use `strip_tags()` when allowing HTML
- Never use `v-html` with unsanitized content

## CSRF Protection
- Include `@csrf` in all Blade forms
- Use Inertia's built-in CSRF handling
- Use `X-CSRF-TOKEN` header for AJAX requests
- Handle 419 errors gracefully

## Secrets and Configuration
- Store secrets in `.env`, never in code
- Use `config()` helper to access configuration
- Never expose `.env` in version control
- Use `env()` only in config files, not in application code
- Rotate API keys and database credentials regularly

## Rate Limiting
- Apply rate limiting to authentication routes
- Use `throttle:api` middleware for API endpoints
- Define custom rate limiters in `RouteServiceProvider`
- Use `Limit::perMinute(60)->by(auth()->id())` for per-user limits

## SQL Injection
- Use Eloquent query builder, never raw SQL with user input
- Use parameter binding for raw queries: `DB::select('SELECT * FROM users WHERE id = ?', [$id])`
- Never use `whereRaw()` without parameter binding
- Use `DB::raw()` only with trusted expressions
