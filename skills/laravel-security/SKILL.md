---
name: laravel-security
description: Laravel security validation authorization policies mass assignment XSS CSRF secrets
implicit: true
---

# Laravel Security

- Validate and authorize every write; use policies for model-level access.
- Persist validated fields only and define explicit mass-assignment rules.
- Scope records to the authenticated user where ownership matters.
- Keep secrets in environment configuration and never expose them to client code.
- Escape untrusted HTML and retain CSRF protection.
- Use parameter bindings for unavoidable raw queries.
