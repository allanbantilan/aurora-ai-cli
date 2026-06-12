---
name: vue-composables
description: Build reusable Vue 3 composition functions for shared logic and state management.
implicit: true
---

# Vue Composables

## Creating Composables
- Name with `use` prefix: `useProducts()`, `usePagination()`, `useDebounce()`
- Place in `resources/js/composables/`
- Export as named functions
- Use Composition API internally

## Common Composables
- `useProducts()` — fetch, create, update, delete products
- `usePagination(page, perPage)` — handle pagination state
- `useDebounce(value, delay)` — debounce input values
- `useSearch(query)` — search with debounce
- `useLoading()` — loading state management
- `useError()` — error handling and display

## State Management
- Use `ref()` for reactive state
- Use `reactive()` for objects
- Use `computed()` for derived values
- Use `watch()` and `watchEffect()` for side effects
- Return state and methods from composable

## API Integration
- Use Inertia router for page navigation
- Use `router.reload()` for partial updates
- Handle loading states during requests
- Handle errors with user feedback
- Use `useForm()` for form handling

## Lifecycle Hooks
- Use `onMounted()` for initial data fetching
- Use `onUnmounted()` for cleanup
- Use `onBeforeUnmount()` for save operations
- Return cleanup functions from composables

## Usage Patterns
```javascript
// Usage in component
const { products, loading, fetchProducts } = useProducts()

onMounted(() => {
  fetchProducts()
})
```

## Best Practices
- Keep composables focused on one concern
- Return reactive state, not raw values
- Use TypeScript for better IDE support
- Document parameters and return values
- Test composables in isolation
