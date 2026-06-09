---
name: eloquent
description: Eloquent models migrations relationships scopes soft delete eager loading database performance
implicit: true
---

# Eloquent

- Define relationships on models and eager-load relations used in loops to prevent N+1 queries.
- Use scopes for reusable constraints, casts for typed attributes, and `withCount()` for counts.
- Use `SoftDeletes` with a matching `deleted_at` migration column when records must be recoverable.
- Add indexes for foreign keys and frequently filtered or ordered columns.
- Use transactions for multi-step writes and cursor/lazy iteration for large datasets.
- Verify migrations and model behavior with focused tests or Artisan checks.
