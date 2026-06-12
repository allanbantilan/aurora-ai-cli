---
name: tailwind
description: Create accessible frontend styling with Tailwind utility classes, responsive layouts, and dark mode.
implicit: true
---

# Tailwind

## Core Principles
- Use utility classes directly in templates, avoid custom CSS
- Follow mobile-first responsive design with breakpoints
- Use the configured design system and color palette
- Keep class order consistent: layout → spacing → typography → visual

## Responsive Design
- Use `sm:`, `md:`, `lg:`, `xl:` prefixes for breakpoints
- Start with mobile styles, add desktop overrides
- Use `container mx-auto` for centered content
- Use grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

## Components
- Use `@apply` sparingly for repeated patterns
- Create Vue component variants for consistent styling
- Use class variance authority (cva) for component variants
- Keep component styles maintainable and composable

## Dark Mode
- Use `dark:` prefix for dark mode styles
- Respect system preference or toggle
- Test both light and dark modes
- Use semantic colors that adapt to mode

## Forms
- Style inputs consistently: `border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500`
- Use `peer` and `peer-placeholder-shown` for floating labels
- Show validation errors with `text-red-500 text-sm`
- Use `disabled:opacity-50 disabled:cursor-not-allowed` for disabled states

## Accessibility
- Use semantic HTML: `<button>`, `<nav>`, `<main>`, `<article>`
- Add `aria-label` for icon-only buttons
- Use `focus:outline-none focus:ring-2 focus:ring-blue-500` for keyboard navigation
- Ensure sufficient color contrast (4.5:1 for text)
- Use `sr-only` for screen-reader-only content

## Typography
- Use `text-sm`, `text-base`, `text-lg` for size hierarchy
- Use `font-medium`, `font-semibold`, `font-bold` for emphasis
- Use `text-gray-600` for secondary text, `text-gray-900` for primary
- Use `leading-relaxed` for readable body text

## Spacing and Layout
- Use consistent spacing: `p-4`, `p-6`, `p-8` for padding
- Use `space-y-4` or `space-x-4` for consistent gaps
- Use `mb-4`, `mb-6`, `mb-8` for vertical spacing
- Use `flex items-center justify-between` for alignment
