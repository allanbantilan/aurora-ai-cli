---
name: pest-testing
description: Test applications with Pest, PHPUnit, Vitest, feature coverage, fakes, and database assertions.
implicit: true
---

# Testing

## Laravel Feature Tests (Pest)
- Use `uses(RefreshDatabase::class)` for database tests
- Use `actingAs($user)` for authenticated requests
- Use `withoutExceptionHandling()` for debugging
- Test HTTP methods: `$response->get('/products')`, `$response->postJson()`
- Assert responses: `assertOk()`, `assertRedirect()`, `assertJson()`
- Assert database: `assertDatabaseHas('products', ['name' => 'Widget'])`

## Laravel Unit Tests
- Test model methods, scopes, and relationships in isolation
- Use factories: `User::factory()->create(['is_admin' => true])`
- Use states: `User::factory()->admin()->create()`
- Test policies: `$this->assertTrue($user->can('update', $product))`
- Test events: Event::fake(), Event::assertDispatched(OrderCreated::class)

## Laravel HTTP Tests
- Test form validation: `$response->assertInvalid(['email' => 'not-an-email'])`
- Test API responses: `$response->assertJsonFragment(['id' => 1])`
- Test headers: `$response->assertHeader('X-Custom', 'value')`
- Test file uploads: `$response->assertJson(['path' => 'uploads/file.pdf'])`

## Vue Component Tests (Vitest)
- Mount components: `mount(ProductCard, { props: { product: mockProduct } })`
- Test emitted events: `wrapper.find('button').trigger('click')`
- Assert emitted: `expect(wrapper.emitted('delete')).toBeTruthy()`
- Test composables: render in test component, assert returned values
- Mock API: `vi.mock('@/api', () => ({ fetchProducts: vi.fn() }))`

## Test Patterns
- Use `it('should...')` for behavior descriptions
- Use `describe()` for grouping related tests
- Use `beforeEach()` for setup, `afterEach()` for cleanup
- Use datasets: `it('handles %s', (input) => { ... })->with([...])`
- Never hit real external services; use Http::fake() or mocks
