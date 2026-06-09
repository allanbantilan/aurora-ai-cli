---
name: laravel-core
description: Implement Laravel controllers, FormRequests, services, actions, routes, policies, authentication, and Artisan scaffolding.
implicit: true
---

# Laravel Core

- Confirm Laravel from `composer.json` and `artisan` before using Laravel conventions.
- Keep controllers focused on HTTP flow. Put reusable business logic in services or focused actions.
- Use FormRequests for validation and authorization; persist only validated data.
- Prefer route model binding, resource routes, policies, and named routes.
- Use Artisan generators before hand-writing framework boilerplate.
- Verify changes with the narrowest relevant Artisan command or test.
