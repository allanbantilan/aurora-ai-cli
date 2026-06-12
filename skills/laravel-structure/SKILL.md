---
name: laravel-structure
description: Design Laravel Vue Inertia project structure across middleware, pages, components, routes, and configuration.
implicit: true
---

# Laravel Project Structure

## Directory Layout
- `app/Http/Controllers` — HTTP layer, thin controllers
- `app/Http/Requests` — Form validation and authorization
- `app/Http/Resources` — API resource transformations
- `app/Http/Middleware` — Request/response middleware
- `app/Models` — Eloquent models with relationships
- `app/Services` — Business logic services
- `app/Actions` — Single-purpose action classes
- `app/Policies` — Authorization policies
- `database/migrations` — Database schema definitions
- `database/factories` — Model factories for testing
- `database/seeders` — Database seeders
- `resources/js/Pages` — Inertia Vue pages
- `resources/js/Components` — Reusable Vue components
- `resources/js/composables` — Vue composition functions
- `resources/js/stores` — Pinia stores
- `routes` — Route definitions

## Laravel Version Detection
- Check `php artisan --version` before assuming file locations
- Laravel 11+: uses `bootstrap/app.php` for middleware registration
- Laravel 10 and below: uses `app/Http/Kernel.php`
- Never read Kernel.php in Laravel 11+ projects

## Routing
- Group routes by middleware and prefix
- Use resource routes for CRUD operations
- Use named routes for redirects
- Register API routes in `routes/api.php`
- Verify routes with `php artisan route:list`

## Configuration
- Use `config()` helper, never `env()` outside config files
- Create config files for custom settings
- Use environment variables for secrets
- Cache config in production: `php artisan config:cache`

## Service Providers
- Register bindings in `AppServiceProvider` for simple cases
- Use dedicated providers for complex service registration
- Use `boot()` for event listeners and view composers
- Use `register()` for container bindings
