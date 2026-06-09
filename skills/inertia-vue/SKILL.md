---
name: inertia-vue
description: Inertia Vue pages props useForm Ziggy script setup composables Pinia Vite
implicit: true
---

# Inertia and Vue

- Keep controller `Inertia::render()` props and Vue `defineProps()` keys exactly aligned.
- Use Vue 3 `<script setup>`, Composition API, `defineEmits`, and computed values.
- Use Inertia `useForm()` for forms, router methods for navigation, and shared middleware data for global props.
- Keep server data in Inertia props; use Pinia for client-only domain or UI state.
- Extract reusable stateful logic into `use*` composables and clean up side effects.
- Verify with the project build and focused frontend tests.
