---
name: vue-pinia
description: Build Pinia stores for centralized state management in Vue 3 applications.
implicit: true
---

# Vue Pinia

## Store Creation
- Use Composition API style: `defineStore('products', () => { ... })`
- Place stores in `resources/js/stores/`
- Name by domain: `products`, `cart`, `auth`, `ui`
- Export stores for IDE support

## State Definition
- Use `ref()` for reactive state: `const products = ref([])`
- Use `reactive()` for complex objects
- Use `computed()` for derived values: `const activeProducts = computed(() => products.value.filter(p => p.active))`
- Initialize with defaults

## Actions (Methods)
- Define actions as functions: `async function fetchProducts() { ... }`
- Use actions for mutations and async operations
- Call API from actions: `const response = await axios.get('/api/products')`
- Update state in actions: `products.value = response.data`

## Getters (Computed)
- Use `computed()` for derived state
- Access other getters: `const total = computed(() => items.value.reduce(...))`
- Use for filtering, sorting, aggregations
- Keep getters pure (no side effects)

## Usage in Components
```javascript
import { useProductStore } from '@/stores/products'

const productStore = useProductStore()
// Access state: productStore.products
// Call action: productStore.fetchProducts()
// Access getter: productStore.activeProducts
```

## Store Patterns
- Use separate stores for different domains
- Keep stores focused and small
- Use actions for all mutations
- Use getters for derived data
- Handle loading and error states

## SSR Compatibility
- Use `defineStore` with SSR support
- Pinia handles hydration automatically
- Use `$reset()` to clear state between requests
- Server-side: create fresh store per request

## Plugins
- Use plugins for logging, persistence, devtools
- Create plugins with `pinia.use()`
- Persist state: `pinia-plugin-persistedstate`
- Log actions in development

## Best Practices
- Don't store server data in Pinia (use Inertia props)
- Use Pinia for client-only state (UI, forms, filters)
- Keep store logic simple and readable
- Test store actions and getters
- Use TypeScript for better DX
