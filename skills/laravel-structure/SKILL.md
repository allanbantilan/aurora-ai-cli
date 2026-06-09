---
name: laravel-structure
description: Design Laravel Vue Inertia project structure across middleware, pages, components, routes, and configuration.
implicit: true
---

# Laravel Project Structure

- Confirm the project version before assuming registration locations.
- Laravel routes live under `routes/`; controllers and middleware under `app/Http/`.
- Inertia pages normally live in `resources/js/Pages/`; reusable Vue components in `resources/js/Components/`.
- Confirm the Vue/Inertia bootstrap and Vite entrypoints from project files.
- Confirm Inertia middleware registration in the version-appropriate application bootstrap.
