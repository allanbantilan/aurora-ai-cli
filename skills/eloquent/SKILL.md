---
name: eloquent
description: Use Eloquent for model relationships, migrations, scopes, soft deletes, eager loading, and database performance.
implicit: true
---

# Eloquent

## Relationships
- Define all relationships on models: hasOne, hasMany, belongsTo, belongsToMany, morphMany
- Use eager loading with `with()` to prevent N+1 queries in loops
- Use `withCount()` for relationship counts without loading full records
- Use `load()` for lazy eager loading when relationship is conditionally needed

## Scopes
- Extract reusable query constraints into local scopes: `Scope::query()->active()->ordered()`
- Use global scopes for soft deletes and default ordering
- Chain scopes for composable query building

## Casts and Accessors
- Use `$casts` for type casting: `'price' => 'decimal:2'`, `'settings' => 'array'`, `'is_active' => 'boolean'`
- Use accessors for computed attributes: `getFullNameAttribute()`
- Use mutators for attribute transformation: `setPasswordAttribute($value)`

## Performance
- Add indexes for foreign keys and frequently filtered/ordered columns
- Use `select()` to fetch only needed columns
- Use `chunk()` or `cursor()` for large dataset processing
- Use `Cache::remember()` for expensive queries
- Use database transactions for multi-step writes

## Soft Deletes
- Use `SoftDeletes` trait with matching `deleted_at` migration column
- Use `withTrashed()` to include deleted records
- Use `onlyTrashed()` to query only deleted records
- Use `forceDelete()` for permanent deletion

## Migrations
- Use `decimal(10, 2)` for money/currency columns
- Use `foreignId()->constrained()->cascadeOnDelete()` for relationships
- Add `index()` on columns used in WHERE, ORDER BY, or JOIN
- Use `nullable()` for optional columns
- Use `Schema::dropIfExists()` for idempotent migrations
