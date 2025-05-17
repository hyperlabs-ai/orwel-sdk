# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
