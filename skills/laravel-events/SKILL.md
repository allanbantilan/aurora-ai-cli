---
name: laravel-events
description: Build Laravel events, listeners, and subscribers for decoupled application logic.
implicit: true
---

# Laravel Events

## Event Creation
- Create events: `php artisan make:event OrderShipped`
- Create listeners: `php artisan make:listener SendShipmentNotification`
- Use events for domain events: `OrderShipped`, `UserRegistered`, `PostPublished`
- Keep events focused on one thing

## Event Structure
- Use event properties for data: `public function __construct(public Order $order) {}`
- Use `ShouldBroadcast` for real-time events
- Use `SerializesModels` for queued listeners
- Keep event data minimal

## Dispatching Events
- Dispatch events: `event(new OrderShipped($order))`
- Use `Event::dispatch()` for dynamic dispatch
- Dispatch after successful operations
- Use `event()` helper for quick dispatches

## Listeners
- Implement `handle()` method with type-hinted event
- Use dependency injection for services
- Keep listeners focused on one task
- Use queued listeners for slow operations: `ShouldQueue`

## Event Subscribers
- Create subscribers: `php artisan make:listener UserEvents --subscriber`
- Group related listeners in one class
- Subscribe to multiple events: `subscribe()`, `getSubscribedEvents()`
- Register in `EventServiceProvider`

## Event Patterns
- Use events for cross-cutting concerns (logging, notifications)
- Use events for side effects that shouldn't block the main flow
- Use events for audit trails and activity logging
- Use events for cache invalidation

## Broadcasting
- Use `ShouldBroadcast` for real-time events
- Use channels: public, private, presence
- Use `broadcast(new OrderShipped($order))` to send
- Use `Broadcast::channel()` for authorization
