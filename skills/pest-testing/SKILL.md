---
name: pest-testing
description: Pest PHPUnit Vitest tests feature coverage fakes database assertions
implicit: true
---

# Testing

- Add focused regression tests for changed behavior.
- Use Laravel feature tests for HTTP workflows and unit tests for isolated logic.
- Use `RefreshDatabase`, authentication helpers, database assertions, and framework fakes where appropriate.
- Never call real external services in tests.
- Run the narrow test first, then the broader relevant suite.
