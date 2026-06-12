---
name: laravel-queues
description: Build Laravel queue jobs with chains, batches, failed job handling, and queue workers.
implicit: true
---

# Laravel Queues

## Job Creation
- Use `php artisan make:job ProcessOrder` for job scaffolding
- Implement `handle()` method with dependency injection
- Use `ShouldQueue` interface for async execution
- Use `dispatch()` to queue jobs: `ProcessOrder::dispatch($order)`

## Job Configuration
- Set `$queue`, `$connection`, `$tries`, `$timeout` properties
- Use `$delay` for delayed execution: `ProcessOrder::dispatch($order)->delay(now()->addMinutes(5))`
- Use `$afterCommit` to run after database commit
- Use `$maxExceptions` for retry behavior

## Chains
- Chain jobs: `Bus::chain([new Step1, new Step2, new Step3])->dispatch()`
- Chain with catch: `Bus::chain([...])->catch(function ($exception) { ... })->dispatch()`
- Chain jobs that depend on previous results

## Batches
- Use `Bus::batch()` for parallel processing
- Track progress: `$batch->progress()`
- Handle completion: `$batch->then()`, `$batch->catch()`
- Cancel batch: `$batch->cancel()`

## Failed Jobs
- Store failed jobs in `failed_jobs` table
- Retry failed: `php artisan queue:retry {id}`
- Retry all: `php artisan queue:retry all`
- Forget failed: `php artisan queue:forget {id}`
- Implement `failed()` method in job for cleanup

## Queue Workers
- Run worker: `php artisan queue:work`
- Specify queue: `php artisan queue:work --queue=high,default,low`
- Sleep between jobs: `php artisan queue:work --sleep=3`
- Stop after time: `php artisan queue:work --max-time=3600`
- Use Supervisor for production workers

## Events and Listeners
- Dispatch events from jobs: `event(new OrderShipped($order))`
- Use listeners for side effects (email, notification)
- Use event subscribers for related events
