---
name: inertia-vue
description: Build Inertia Vue pages with props, useForm, Ziggy, script setup, composables, Pinia, and Vite.
implicit: true
---

# Inertia and Vue

## Controller to Vue Contract
- Controller `Inertia::render()` props must exactly match Vue `defineProps()`
- Paginated results arrive as `{ data: [], links: [], meta: {} }`
- Single models arrive as plain objects
- Use `Only` or `select()` to limit fields, never pass entire collections
- Document the contract as a comment at top of Vue page

## Inertia::render() Patterns
- `Inertia::render('Products/Index', ['products' => $products])`
- `Inertia::render('Products/Show', ['product' => $product])`
- Use `Inertia::location()` for external redirects
- Use `back()` for validation failures
- Use `Inertia::reload()` for partial reloads

## Vue 3 Composition API
- Always use `<script setup>` syntax
- Use `defineProps()` with runtime type declarations
- Use `defineEmits()` for all events
- Use `ref()`, `reactive()`, `computed()` for state
- Use `onMounted()` for initial data fetching
- Extract reusable logic into composables: `useProducts()`, `usePagination()`

## Inertia Composables
- `useForm()` for form handling with validation errors
- `useRemember()` for preserving form state
- `usePage()` for accessing current page props
- `router.visit()` for navigation
- `router.reload()` for partial page refreshes

## Forms
- Use `useForm({ name: '', price: '' })` for form state
- Handle processing state: `form.post('/products')`
- Display errors: `form.errors.name`
- Reset after success: `form.reset()`
- Use `form.transform()` for data preparation

## Pinia Stores
- Use stores for cross-component state
- Keep server data in Inertia props, client state in Pinia
- Define stores with `defineStore('name', () => { ... })`
- Use actions for mutations, getters for computed state

## Ziggy Routes
- Use `route('products.index')` in Vue for named routes
- Pass parameters: `route('products.show', product.id)`
- Use `route().current()` for active link detection
- Import route from `ziggy-js` for TypeScript support

## Partial Reloads
- Use `router.reload({ only: ['products'] })` for targeted updates
- Preserve scroll position with `preserveScroll: true`
- Use `Inertia::reload()` with `only` parameter in controllers
