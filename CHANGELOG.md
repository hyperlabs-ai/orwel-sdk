# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2024-06-21

### Fixed
- **IntelliSense Support**: Fixed TypeScript IntelliSense not showing proper types in client projects
- **Package Exports**: Added "types" field to package.json exports for better module resolution
- **Default Export**: Added default export for improved import experience
- **TypeScript Config**: Improved TypeScript configuration for better type generation and resolution

### Changed
- Enhanced package.json with proper exports configuration
- Updated tsconfig.json with optimized settings for type generation
- Added declaration maps for better debugging experience

### Added
- Multiple import styles support: named import, default import, and type imports
- Enhanced developer experience with better IntelliSense support
- Debug guide for troubleshooting IntelliSense issues

## [1.3.0] - 2024-06-20

### Added
- **Parameter Validation**: Comprehensive runtime validation for all SDK methods
  - API key format validation (must start with 'orwel_' and be at least 20 characters)
  - Event code validation (lowercase letters, numbers, and underscores only, max 50 chars)
  - Email format validation when present in properties
  - Required parameter validation with clear error messages
  - Type safety validation for objects and form elements
- **Enhanced IntelliSense**: Detailed JSDoc documentation for all methods and interfaces
  - Method descriptions with usage examples
  - Parameter documentation with type hints
  - Return type information
  - Best practices and validation rules displayed in IDE
- **Conversion Tracking**: New `orwel.conversion(code, properties)` method for capturing potential customers and prospects (renamed from `lead`)
  - Independent conversion records with unique identifiers
  - Event-based conversion categorization (e.g., 'newsletter_signup', 'demo_request', 'contact_form')
  - Automatic browser information collection merged with provided properties
  - Separate from visitor identification for better conversion management
- **Batch Processing**: Events are now sent in batches for improved performance and reduced network overhead
  - New `sendBatch()` method in API client for bulk event processing
  - Automatic fallback to individual sends if batch endpoint is unavailable
  - 5-10x performance improvement with 90% reduction in HTTP requests
  - Partial failure handling for robust error recovery
  - Circuit breaker integration for batch processing
- Enhanced TypeScript definitions for the new conversion tracking and batch processing functionality
- Comprehensive documentation and examples for conversion tracking and batch processing use cases

### Improved
- Updated visitor manager to support both visitor identification and conversion capture
- Enhanced event queue system to handle conversion events and batch processing
- Better separation of concerns between visitor tracking and conversion generation
- Optimized network performance through intelligent batching

## [1.0.20] - 2025-05-24

### Fixed
- Fixed form tracking event listeners not being properly cleaned up when navigating between pages
- Fixed form abandonment detection being too aggressive and triggering false positives
- Fixed duplicate form events being tracked for the same field interactions
- Improved event listener cleanup using stored references instead of anonymous functions

### Improved
- Enhanced form field filtering to only track relevant input elements (input, select, textarea)
- Reduced event noise by excluding non-trackable fields (hidden, submit, button, reset, image)
- Made form abandonment detection more intelligent with time-based and interaction-based conditions
- Changed default trackFocus option to false to reduce excessive event tracking
- Better form metadata collection with field value length and interaction context

### Added
- Complete cleanup function for proper form tracking teardown on page navigation
- Additional navigation event listeners (popstate, pagehide) for comprehensive cleanup
- Form interaction validation requiring minimum 10 seconds engagement and meaningful changes
- Enhanced abandonment detection with timeout vs navigation reason classification
- Stored event listener references for reliable cleanup and memory management

### Optimized
- More conservative default form tracking options to reduce unnecessary events
- Smart form abandonment detection that only triggers for meaningful user interactions
- Improved memory management with proper observer and listener cleanup
- Better performance through selective event listener attachment based on enabled options

## [1.0.19] - 2025-05-22

### Fixed
- Multiple intents to send events with retry methods and circuitBreaker

## [1.0.18] - 2025-05-18

### Added
- Added request timeout protection (5s) for all API calls
- Implemented circuit breaker pattern for API request failure protection
- Added queue size limits (1000 events) with smart event prioritization
- Added safe monitoring setup with isolated error handling per monitor

### Improved
- Removed confirmation dialog when navigating away from page
- Fixed session synchronization to ensure sessions are created before events
- Enhanced error handling across all SDK operations
- Improved queue management with session event prioritization
- Added graceful degradation for monitoring features
- Better memory management with queue size limits
- More robust error recovery in network operations

### Optimized
- Implemented smart event dropping when queue is full
- Added automatic circuit breaker reset after 1 minute
- Enhanced logging with more detailed error information
- Improved monitoring initialization with isolated failure handling
- Better session event handling with priority queuing

### Fixed
- Fixed potential memory leaks in event queue
- Improved error handling in monitoring setup
- Enhanced API call reliability with timeout protection
- Better handling of network failures with circuit breaker
- Protected against monitoring setup failures affecting core functionality

## [1.0.17] - 2025-05-17

### Added
- Added form tracking functionality with `orwel.form()`
- Support for tracking form events: focus, input, change, submit, abandon
- Detailed form interaction analysis with field-level tracking
- Form submission success/error detection
- Added form tracking example page
- Automatic form untracking when forms are removed from DOM or hidden
- MutationObserver and IntersectionObserver support for smart form tracking

### Improved
- Expanded TypeScript definitions for better IDE support
- Enhanced metadata collection for form events
- Better form abandonment detection with configurable tracking options
- Memory management for forms through automatic cleanup

## [1.0.16] - 2025-05-16

### Added
- Added storage availability check for better Safari mobile support
- Implemented memory-based fallback storage for private browsing mode
- Added robust error handling for storage operations
- Added proper session lifecycle management with status tracking
- Added session timestamps (startedAt, updatedAt, finishedAt)
- Added TypeScript interfaces for better type safety in session handling

### Fixed
- Fixed visitor traits not being saved in Safari mobile private browsing
- Improved storage reliability across all browsers and modes
- Enhanced error recovery when localStorage is not available
- Fixed session state management during page unload
- Fixed synchronous session closure on page exit

### Improved
- Better error handling and logging for storage operations
- More resilient visitor identification process
- Graceful degradation when persistent storage is unavailable
- Enhanced session tracking with proper lifecycle states
- More robust session data persistence
- Improved session state transitions (active → closed)

## [1.0.15] - 2025-05-15

### Refactored
- Location on each event now tracked
- Monitoring disabled by default to ignore errors in console

## [1.0.14] - 2025-05-15

### Fixed
- Removed data sanitization that was causing issues with event payload format
- Fixed initialization order of internal modules
- Restored original event payload structure for better API compatibility
- Improved dependency resolution between internal components
- Fixed visitor traits handling to match previous working implementation

## [1.0.13] - 2025-05-15

### Added
- Added UUID dependency for more robust unique ID generation
- Implemented data sanitization to prevent issues with circular references and non-serializable values

### Refactored
- Complete modularization of the SDK core
  - Separated visitor management into dedicated module
  - Created standalone session handling module
  - Extracted queue management logic into its own module
  - Isolated API communication in a dedicated client
  - Implemented centralized storage module for all persistence operations
- Improved dependency injection pattern for better testability
- Enhanced circular dependency resolution between modules

### Optimized
- Better memory usage through improved module isolation
- Reduced code duplication across components
- More consistent error handling across modules
- Data sanitization for all user-provided inputs to prevent serialization issues

## [1.0.12] - 2025-05-14

### Fixed
- Fixed track event format to properly structure the event id object
- Included event code within the event object structure
- Ensured correct event payload format to prevent 400 Bad Request errors

## [1.0.11] - 2025-05-14

### Optimized
- Implemented session event buffering, significantly reducing the number of events sent
- Added event batching for all monitoring modules (web-vitals, performance, network, errors, console)
- Reduced data collection frequency in Web Vitals (removed reportAllChanges: true)
- Increased memory monitoring interval to 60 seconds
- Limited the number of monitored resources to prevent congestion

### Fixed
- Resolved overload issue caused by multiple session events being sent simultaneously
- Correctly exported the orwel instance
- Improved browser memory management
- Added retry limit for failed network requests to prevent infinite loops

## [1.0.10] - 2025-05-14

### Added
- Support for Web Vitals (LCP, FID, CLS, TTFB, FCP)
- New performance metrics for resources and navigation

### Improved
- Better TypeScript support with complete type definitions
- More efficient backend event processing

## [1.0.9] - 2025-05-13

### Added
- Performance monitoring with PerformanceObserver
- Automatic JavaScript error tracking
- System to save events in localStorage when offline

### Updated
- Improved session information collection
- Bundle size optimization

## [1.0.0] - 2025-05-12

### Added
- First stable SDK release
- Core functionalities: track, identify, log
- Basic performance and error monitoring
- Compatibility with modern browsers
