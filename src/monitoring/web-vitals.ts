import { Orwel } from '../types';
import { getLCP, getFID, getCLS, getTTFB, getFCP } from 'web-vitals';

/**
 * Setup Web Vitals monitoring for core metrics:
 * - LCP (Largest Contentful Paint): measures loading performance
 * - FID (First Input Delay): measures interactivity
 * - CLS (Cumulative Layout Shift): measures visual stability
 * - TTFB (Time to First Byte): measures server response time
 * - FCP (First Contentful Paint): measures perceived load speed
 */
export const setupWebVitalsMonitoring = (orwel: Orwel): void => {
  // Create webVitals object to store metrics
  const webVitals: Record<string, any> = {};
  
  // Helper to update session with the latest web vitals data
  const updateSession = (metric: any) => {
    // Store the metric value
    webVitals[metric.name] = {
      value: metric.value,
      rating: getRating(metric.name, metric.value),
      id: metric.id,
      navigationType: metric.navigationType || 'unknown'
    };
    
    // Update session with all collected web vitals
    orwel.session({
      webVitals
    });
  };

  // Monitor LCP (Largest Contentful Paint)
  getLCP(updateSession, true);
  
  // Monitor FID (First Input Delay)
  getFID(updateSession, true);
  
  // Monitor CLS (Cumulative Layout Shift)
  getCLS(updateSession, true);
  
  // Monitor TTFB (Time to First Byte)
  getTTFB(updateSession, true);
  
  // Monitor FCP (First Contentful Paint)
  getFCP(updateSession, true);
};

/**
 * Helper function to determine the rating (good, needs improvement, poor)
 * based on the Google Web Vitals thresholds.
 */
const getRating = (metricName: string, value: number): string => {
  switch (metricName) {
    case 'LCP':
      // LCP: Good < 2.5s, Needs Improvement < 4s, Poor >= 4s
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
      
    case 'FID':
      // FID: Good < 100ms, Needs Improvement < 300ms, Poor >= 300ms
      return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
      
    case 'CLS':
      // CLS: Good < 0.1, Needs Improvement < 0.25, Poor >= 0.25
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
      
    case 'TTFB':
      // TTFB: Good < 800ms, Needs Improvement < 1800ms, Poor >= 1800ms
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
      
    case 'FCP':
      // FCP: Good < 1.8s, Needs Improvement < 3s, Poor >= 3s
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
      
    default:
      return 'unknown';
  }
}; 