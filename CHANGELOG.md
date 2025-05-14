# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
