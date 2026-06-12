---
name: laravel-api
description: Build Laravel APIs with resources, rate limiting, authentication, and versioning.
implicit: true
---

# Laravel API

## API Resources
- Create resources: `php artisan make:resource ProductResource`
- Transform models: `$this->transform($product)` in controller
- Use collections: `ProductResource::collection($products)`
- Wrap responses: `['data' => ProductResource::collection($products)]`
- Conditionally include fields: `$this->whenLoaded('category')`

## Resource Controllers
- Use `Route::apiResource('products', ProductController::class)`
- Implement index, store, show, update, destroy
- Return JSON responses: `return response()->json($data, 200)`
- Return 201 for created: `return response()->json($data, 201)`

## Rate Limiting
- Use `throttle:api` middleware on routes
- Define limiters in `RouteServiceProvider`: `RateLimiter::for('api', ...)`
- Per-user limits: `Limit::perMinute(60)->by(auth()->id())`
- Custom limits: `Limit::none()` for authenticated users

## Authentication
- Use Laravel Sanctum for API tokens
- Use `$request->user()->tokenCan('posts.create')` for abilities
- Use middleware: `auth:sanctum` for protected routes
- Issue tokens: `$user->createToken('name')->plainTextToken`

## Versioning
- Use URL versioning: `/api/v1/products`
- Use route groups with prefix
- Use request headers for version detection
- Maintain backward compatibility

## Response Formatting
- Use consistent response structure
- Include meta data: pagination, filters
- Handle errors: `response()->json(['error' => 'Not found'], 404)`
- Use HTTP status codes correctly

## Documentation
- Use OpenAPI/Swagger for API documentation
- Document request/response schemas
- Include authentication requirements
- Provide example requests/responses
