---
name: laravel-core
description: Implement Laravel controllers, FormRequests, services, actions, routes, policies, authentication, and Artisan scaffolding.
implicit: true
---

# Laravel Core

## Controllers
- Keep controllers focused on HTTP flow only
- Use dependency injection for services, not instantiation
- Use `$this->authorize()` or policy helpers for authorization
- Use FormRequest for validation, never `$request->all()`
- Return Inertia responses with consistent prop shapes

## FormRequests
- Create dedicated request classes: `Store[Model]Request`, `Update[Model]Request`
- Implement `authorize()` for authorization logic
- Define `rules()` for validation with proper messages
- Use `sometimes()` for conditional validation in update requests
- Access validated data with `$request->validated()`

## Routes
- Use resource routes: `Route::resource('products', ProductController::class)`
- Use route model binding: `Route::get('products/{product}', [ProductController::class, 'show'])`
- Group routes by middleware: `Route::middleware('auth')->group(function () { ... })`
- Use named routes for redirects: `route('products.index')`
- Use route lists to verify: `php artisan route:list --name=product`

## Services and Actions
- Extract complex business logic into service classes
- Use single-action classes for focused operations
- Inject services via constructor: `public function __construct(private OrderService $orders) {}`
- Keep controllers thin, services focused, actions single-purpose

## Middleware
- Create middleware for cross-cutting concerns
- Use `$middleware->web(append: [...])` in Laravel 11+ bootstrap/app.php
- Register middleware groups for route protection
- Use `Route::middleware('throttle:api')` for rate limiting

## Artisan Generators
- `php artisan make:model Product -mfsc` (model, migration, factory, seeder, controller)
- `php artisan make:controller ProductController --resource --model=Product`
- `php artisan make:request StoreProductRequest`
- `php artisan make:resource ProductResource`
- `php artisan make:policy ProductPolicy --model=Product`

## Authentication
- Use Laravel Breeze or Jetstream for auth scaffolding
- Use `Auth::user()` or dependency injection for current user
- Use gates and policies for authorization
- Use `auth()->user()?->can()` for conditional checks
