import { createLogger } from "../utils";

/**
 * FormTracker - Monitors form interactions and reports events through Orwel
 */
export interface FormOptions {
  formId?: string;
  trackFocus?: boolean;
  trackInput?: boolean;
  trackChange?: boolean;
  trackSubmit?: boolean;
  trackAbandon?: boolean;
  autoUntrack?: boolean;
  submitCallback?: (result: { success: boolean; error?: Error }) => void;
}

export interface FormTracker {
  /**
   * Attach form tracking to a specific form element
   */
  trackForm: (form: HTMLFormElement, options?: FormOptions) => void;

  /**
   * Stop tracking a specific form
   */
  untrackForm: (form: HTMLFormElement) => void;

  /**
   * Stop tracking all forms
   */
  untrackAllForms: () => void;
}

interface FormData {
  formElement: HTMLFormElement;
  options: FormOptions;
  startTime: number;
  lastActiveTime: number;
  focusedFields: Set<string>;
  changedFields: Set<string>;
  filledFields: Set<string>;
  submitting: boolean;
  hasInteracted: boolean;
  mutationObserver?: MutationObserver;
  intersectionObserver?: IntersectionObserver;
  // Store references to event listeners for proper cleanup
  listeners: {
    focus?: (event: Event) => void;
    blur?: (event: Event) => void;
    change?: (event: Event) => void;
    submit?: (event: SubmitEvent) => void;
  };
}

export function createFormTracker(
  track: (
    eventName: string,
    properties: Record<string, any>
  ) => { success: boolean; eventId: string },
  logger: ReturnType<typeof createLogger>
): FormTracker {
  // Store all tracked forms
  const trackedForms = new Map<HTMLFormElement, FormData>();
  
  // Store global listener references for proper cleanup
  let globalListenersSetup = false;
  let beforeUnloadListener: (() => void) | null = null;
  let visibilityChangeListener: (() => void) | null = null;

  // Help extract field metadata consistently
  const getFieldMetadata = (field: HTMLElement) => {
    return {
      field_id: field.id || undefined,
      field_name: (field as HTMLInputElement).name || undefined,
      field_type:
        (field as HTMLInputElement).type || field.tagName.toLowerCase(),
      field_position:
        Array.from(field.parentElement?.children || []).indexOf(field) + 1,
      field_required: (field as HTMLInputElement).required || false,
      field_label:
        field.getAttribute("aria-label") ||
        document
          .querySelector(`label[for="${field.id}"]`)
          ?.textContent?.trim() ||
        undefined,
    };
  };

  // Get form metadata in a standardized way
  const getFormMetadata = (form: HTMLFormElement, formData: FormData) => {
    // Get all interactive elements
    const fields = Array.from(
      form.querySelectorAll('input, select, textarea, button[type="submit"]')
    );

    // Count fields by type
    const fieldTypes = fields.reduce(
      (acc, field) => {
        const type =
          (field as HTMLInputElement).type || field.tagName.toLowerCase();
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const formId =
      formData.options.formId ||
      form.id ||
      form.getAttribute("name") ||
      form.getAttribute("action") ||
      "unknown_form";

    return {
      form_id: formId,
      form_name: form.getAttribute("name") || undefined,
      form_action: form.getAttribute("action") || undefined,
      form_method: form.getAttribute("method") || "get",
      form_fields_count: fields.length,
      form_fields_types: fieldTypes,
      form_fields_required: fields.filter(
        (f) => (f as HTMLInputElement).required
      ).length,
      time_on_form_ms: Date.now() - formData.startTime,
      time_since_last_interaction_ms: Date.now() - formData.lastActiveTime,
      fields_filled_count: formData.filledFields.size,
      fields_changed_count: formData.changedFields.size,
      fields_focused_count: formData.focusedFields.size,
    };
  };

  // Helper to check if element should be tracked
  const isTrackableField = (element: Element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const validTags = ['input', 'select', 'textarea'];
    
    if (!validTags.includes(tagName)) return false;
    
    // Skip hidden inputs and buttons (except submit buttons which we handle differently)
    if (tagName === 'input') {
      const input = element as HTMLInputElement;
      const type = input.type.toLowerCase();
      
      // Skip these input types as they don't need focus/input tracking
      const skipTypes = ['hidden', 'submit', 'button', 'reset', 'image'];
      if (skipTypes.includes(type)) return false;
    }
    
    return true;
  };

  // Event handlers
  const handleFocus = (event: FocusEvent) => {
    const field = event.target as HTMLElement;
    if (!isTrackableField(field)) return;

    const form = field.closest("form");
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
    
    // Only update interaction state if this is actually a meaningful interaction
    formData.hasInteracted = true;
    formData.lastActiveTime = Date.now();

    // Mark this field as focused
    const fieldId =
      field.id || (field as HTMLInputElement).name || `field_${Date.now()}`;
    formData.focusedFields.add(fieldId);

    // Only track if option enabled
    if (formData.options.trackFocus) {
      const metadata = getFormMetadata(form, formData);
      const fieldMeta = getFieldMetadata(field);

      track("form_focus", {
        ...metadata,
        ...fieldMeta,
      });
    }
  };

  const handleBlur = (event: FocusEvent) => {
    const field = event.target as HTMLElement;
    if (!isTrackableField(field)) return;

    const form = field.closest("form");
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
    formData.lastActiveTime = Date.now();

    // Check if field has meaningful value
    const fieldValue = (field as HTMLInputElement).value?.trim() || '';
    const hasValue = fieldValue.length > 0;

    if (hasValue) {
      // Mark field as filled
      const fieldId =
        field.id || (field as HTMLInputElement).name || `field_${Date.now()}`;
      formData.filledFields.add(fieldId);

      // Only track input if option enabled and we haven't already tracked this field's input
      if (formData.options.trackInput && !formData.filledFields.has(fieldId + '_tracked')) {
        formData.filledFields.add(fieldId + '_tracked'); // Mark as tracked to avoid duplicates
        
        const metadata = getFormMetadata(form, formData);
        const fieldMeta = getFieldMetadata(field);

        track("form_input", {
          ...metadata,
          ...fieldMeta,
          has_value: true,
          field_value_length: fieldValue.length,
        });
      }
    }
  };

  const handleChange = (event: Event) => {
    const field = event.target as HTMLElement;
    if (!isTrackableField(field)) return;

    const form = field.closest("form");
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
    formData.hasInteracted = true;
    formData.lastActiveTime = Date.now();

    // Mark this field as changed
    const fieldId =
      field.id || (field as HTMLInputElement).name || `field_${Date.now()}`;
    formData.changedFields.add(fieldId);

    // Only track if option enabled
    if (formData.options.trackChange) {
      const metadata = getFormMetadata(form, formData);
      const fieldMeta = getFieldMetadata(field);

      const fieldValue = (field as HTMLInputElement).value?.trim() || '';

      track("form_change", {
        ...metadata,
        ...fieldMeta,
        has_value: fieldValue.length > 0,
        field_value_length: fieldValue.length,
      });
    }
  };

  const handleSubmit = (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement;
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
    formData.lastActiveTime = Date.now();
    formData.hasInteracted = true;
    formData.submitting = true;

    // Only track if option enabled
    if (formData.options.trackSubmit) {
      const metadata = getFormMetadata(form, formData);

      track("form_submit_attempt", {
        ...metadata,
      });

      // We need to track the result (success/error)
      // Use a Promise to detect when form submission is complete
      Promise.resolve().then(() => {
        try {
          // Check for validation errors
          const isValid = form.checkValidity();
          if (!isValid) {
            // Get invalid fields
            const invalidFields = Array.from(
              form.querySelectorAll(":invalid")
            ).map(
              (f) =>
                (f as HTMLInputElement).name || f.id || f.tagName.toLowerCase()
            );

            track("form_submit_error", {
              ...metadata,
              validation_failed: true,
              invalid_fields: invalidFields,
            });

            if (formData.options.submitCallback) {
              formData.options.submitCallback({
                success: false,
                error: new Error("Form validation failed"),
              });
            }

            // Mark form as no longer submitting
            formData.submitting = false;
            return;
          }

          // Assume success for now, browser will handle the actual submit
          track("form_submit_success", {
            ...metadata,
          });

          if (formData.options.submitCallback) {
            formData.options.submitCallback({ success: true });
          }

          // Form will navigate away, so we don't need to reset submitting
        } catch (error) {
          track("form_submit_error", {
            ...metadata,
            error_message: (error as Error).message,
          });

          if (formData.options.submitCallback) {
            formData.options.submitCallback({
              success: false,
              error: error as Error,
            });
          }

          // Mark form as no longer submitting
          formData.submitting = false;
        }
      });
    }
  };

  // Complete cleanup function for page navigation
  const cleanupAllTracking = () => {
    logger.debug("Cleaning up all form tracking due to page navigation");
    
    // Process abandonment for all tracked forms
    trackedForms.forEach((formData, form) => {
      detectAbandon(form, formData);
      cleanupFormObservers(formData);
      teardownFormListeners(form, formData);
    });
    
    // Clear all tracked forms
    trackedForms.clear();
    
    // Force cleanup of global listeners
    if (beforeUnloadListener) {
      window.removeEventListener("beforeunload", beforeUnloadListener);
      beforeUnloadListener = null;
    }
    if (visibilityChangeListener) {
      document.removeEventListener("visibilitychange", visibilityChangeListener);
      visibilityChangeListener = null;
    }
    window.removeEventListener("popstate", cleanupAllTracking);
    window.removeEventListener("pagehide", cleanupAllTracking);
    globalListenersSetup = false;
  };

  // Sets up page visibility and beforeunload listeners to detect form abandonment
  const setupGlobalListeners = () => {
    if (globalListenersSetup) return; // Already setup
    
    beforeUnloadListener = () => {
      // Clean up everything before page unloads
      cleanupAllTracking();
    };
    
    visibilityChangeListener = () => {
      if (document.visibilityState === "hidden") {
        // Check each tracked form for abandonment when user switches tabs
        trackedForms.forEach((formData, form) => {
          detectAbandon(form, formData);
        });
      }
    };
    
    window.addEventListener("beforeunload", beforeUnloadListener);
    document.addEventListener("visibilitychange", visibilityChangeListener);
    
    // Also listen for popstate (back/forward navigation) and pagehide
    window.addEventListener("popstate", cleanupAllTracking);
    window.addEventListener("pagehide", cleanupAllTracking);
    
    globalListenersSetup = true;
  };

  // Helper to check if a form was abandoned
  const detectAbandon = (form: HTMLFormElement, formData: FormData) => {
    // Only track abandonment if:
    // 1. The option is enabled
    // 2. The user has meaningfully interacted with the form (not just focused)
    // 3. The form is not currently being submitted
    // 4. The form has fields that were actually changed (not just focused)
    // 5. User spent at least 10 seconds on the form
    // 6. User interacted with the form in the last 30 minutes (avoid stale forms)
    
    const timeOnForm = Date.now() - formData.startTime;
    const timeSinceLastInteraction = Date.now() - formData.lastActiveTime;
    const hasChangedFields = formData.changedFields.size > 0;
    const hasFilledFields = formData.filledFields.size > 0;
    
    if (
      formData.options.trackAbandon &&
      formData.hasInteracted &&
      !formData.submitting &&
      (hasChangedFields || hasFilledFields) &&
      timeOnForm > 10000 && // At least 10 seconds
      timeSinceLastInteraction < 1800000 // Less than 30 minutes since last interaction
    ) {
      const metadata = getFormMetadata(form, formData);

      track("form_abandon", {
        ...metadata,
        fields_started: Array.from(formData.focusedFields),
        fields_changed: Array.from(formData.changedFields),
        fields_filled: Array.from(formData.filledFields),
        abandon_reason: timeSinceLastInteraction > 300000 ? 'timeout' : 'navigation',
      });
    }
  };

  // Set up listeners for a specific form
  const setupFormListeners = (form: HTMLFormElement, formData: FormData) => {
    // Setup event listeners only for the events we want to track
    if (formData.options.trackFocus) {
      formData.listeners.focus = (event) => {
        if (isTrackableField(event.target as Element)) {
          handleFocus(event as FocusEvent);
        }
      };
      form.addEventListener("focus", formData.listeners.focus, true);
    }
    
    if (formData.options.trackInput) {
      formData.listeners.blur = (event) => {
        if (isTrackableField(event.target as Element)) {
          handleBlur(event as FocusEvent);
        }
      };
      form.addEventListener("blur", formData.listeners.blur, true);
    }
    
    if (formData.options.trackChange) {
      formData.listeners.change = (event) => {
        if (isTrackableField(event.target as Element)) {
          handleChange(event);
        }
      };
      form.addEventListener("change", formData.listeners.change);
    }

    // Submit listener always goes on the form itself
    if (formData.options.trackSubmit) {
      formData.listeners.submit = handleSubmit;
      form.addEventListener("submit", formData.listeners.submit);
    }

    // Set up auto-untracking if enabled
    if (formData.options.autoUntrack) {
      setupAutoUntrack(form, formData);
    }
  };

  // Set up automatic untracking for forms
  const setupAutoUntrack = (form: HTMLFormElement, formData: FormData) => {
    // 1. Use MutationObserver to detect when the form is removed from DOM
    const mutationObserver = new MutationObserver((mutations) => {
      // Check if form was removed from DOM
      if (!document.body.contains(form)) {
        logger.debug("Form removed from DOM, auto-untracking", {
          formId: formData.options.formId || form.id || "unnamed_form",
        });
        untrackForm(form);
        mutationObserver.disconnect();
      }
    });

    // Observe the whole document for removals
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Store the observer for cleanup
    formData.mutationObserver = mutationObserver;

    // 2. Use IntersectionObserver to detect when the form is no longer visible
    if ("IntersectionObserver" in window) {
      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          // Check if form is visible
          const entry = entries[0];

          // If form is not intersecting (not visible) for more than 10 seconds
          if (!entry.isIntersecting) {
            // We don't want to untrack immediately, so we'll wait a bit
            const timeoutId = setTimeout(() => {
              // Check if still tracked and still not visible
              if (trackedForms.has(form) && !document.body.contains(form)) {
                logger.debug(
                  "Form not visible for extended period, auto-untracking",
                  {
                    formId:
                      formData.options.formId || form.id || "unnamed_form",
                  }
                );
                detectAbandon(form, formData);
                untrackForm(form);
              }
            }, 10000); // 10 seconds timeout

            // Store timeout ID for cleanup
            (formData as any).visibilityTimeoutId = timeoutId;
          } else if ((formData as any).visibilityTimeoutId) {
            // If form is visible again, clear the timeout
            clearTimeout((formData as any).visibilityTimeoutId);
            (formData as any).visibilityTimeoutId = null;
          }
        },
        { threshold: 0.1 }
      ); // 10% of the form must be visible

      intersectionObserver.observe(form);

      // Store the observer for cleanup
      formData.intersectionObserver = intersectionObserver;
    }
  };

  // Remove listeners from a specific form using stored references
  const teardownFormListeners = (form: HTMLFormElement, formData: FormData) => {
    if (formData.listeners.focus) {
      form.removeEventListener("focus", formData.listeners.focus, true);
    }
    if (formData.listeners.blur) {
      form.removeEventListener("blur", formData.listeners.blur, true);
    }
    if (formData.listeners.change) {
      form.removeEventListener("change", formData.listeners.change);
    }
    if (formData.listeners.submit) {
      form.removeEventListener("submit", formData.listeners.submit);
    }
    
    // Clear listener references
    formData.listeners = {};
  };

  // Cleanup all observers and timeouts
  const cleanupFormObservers = (formData: FormData) => {
    // Disconnect mutation observer
    if (formData.mutationObserver) {
      formData.mutationObserver.disconnect();
    }

    // Disconnect intersection observer
    if (formData.intersectionObserver) {
      formData.intersectionObserver.disconnect();
    }

    // Clear visibility timeout if it exists
    if ((formData as any).visibilityTimeoutId) {
      clearTimeout((formData as any).visibilityTimeoutId);
    }
  };

  // Public API
  return {
    trackForm: (form: HTMLFormElement, options: FormOptions = {}) => {
      if (!(form instanceof HTMLFormElement)) {
        logger.error("Cannot track form: invalid element", { form });
        return;
      }

      // Default options - more conservative approach
      const defaultOptions: FormOptions = {
        trackFocus: false, // Don't track focus by default (too noisy)
        trackInput: true,  // Track when users input values
        trackChange: true, // Track when users change values
        trackSubmit: true, // Always track submissions
        trackAbandon: true, // Track abandonment
        autoUntrack: true, // Auto cleanup
      };

      // Merge options
      const mergedOptions = { ...defaultOptions, ...options };

      // Stop tracking if already tracked
      if (trackedForms.has(form)) {
        untrackForm(form);
      }

      // Create form data
      const formData: FormData = {
        formElement: form,
        options: mergedOptions,
        startTime: Date.now(),
        lastActiveTime: Date.now(),
        focusedFields: new Set(),
        changedFields: new Set(),
        filledFields: new Set(),
        submitting: false,
        hasInteracted: false,
        listeners: {},
      };

      // Store form data
      trackedForms.set(form, formData);

      // Setup listeners
      setupFormListeners(form, formData);

      // Setup global listeners if this is the first form
      if (trackedForms.size === 1) {
        setupGlobalListeners();
      }

      logger.debug("Form tracking started", {
        formId: mergedOptions.formId || form.id || "unnamed_form",
        options: mergedOptions,
      });
    },

    untrackForm: (form: HTMLFormElement) => {
      if (!trackedForms.has(form)) return;

      // Get form data
      const formData = trackedForms.get(form)!;

      // Check for abandonment before untracking
      detectAbandon(form, formData);

      // Clean up observers
      cleanupFormObservers(formData);

      // Remove listeners
      teardownFormListeners(form, formData);

      // Remove from tracked forms
      trackedForms.delete(form);

      // Remove global listeners if no forms left
      if (trackedForms.size === 0) {
        cleanupAllTracking();
      }

      logger.debug("Form tracking stopped", {
        formId: formData.options.formId || form.id || "unnamed_form",
      });
    },

    untrackAllForms: () => {
      // Just use the cleanup function which does everything
      cleanupAllTracking();

      logger.debug("All form tracking stopped");
    },
  };

  // Helper function referenced in public API
  function untrackForm(form: HTMLFormElement) {
    if (!trackedForms.has(form)) return;

    // Get form data
    const formData = trackedForms.get(form)!;

    // Check for abandonment before untracking
    detectAbandon(form, formData);

    // Clean up observers
    cleanupFormObservers(formData);

    // Remove listeners
    teardownFormListeners(form, formData);

    // Remove from tracked forms
    trackedForms.delete(form);

    logger.debug("Form tracking stopped", {
      formId: formData.options.formId || form.id || "unnamed_form",
    });
  }
}
