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

  // Event handlers
  const handleFocus = (event: FocusEvent) => {
    const field = event.target as HTMLElement;
    if (!field || !(field instanceof Element)) return;

    const form = field.closest("form");
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
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
    if (!field || !(field instanceof Element)) return;

    const form = field.closest("form");
    if (!form || !trackedForms.has(form)) return;

    const formData = trackedForms.get(form)!;
    formData.lastActiveTime = Date.now();

    // Check if field has value
    const hasValue = (field as HTMLInputElement).value?.trim().length > 0;

    if (hasValue) {
      // Mark field as filled
      const fieldId =
        field.id || (field as HTMLInputElement).name || `field_${Date.now()}`;
      formData.filledFields.add(fieldId);

      // Track input if option enabled
      if (formData.options.trackInput) {
        const metadata = getFormMetadata(form, formData);
        const fieldMeta = getFieldMetadata(field);

        track("form_input", {
          ...metadata,
          ...fieldMeta,
          has_value: true,
        });
      }
    }
  };

  const handleChange = (event: Event) => {
    const field = event.target as HTMLElement;
    if (!field || !(field instanceof Element)) return;

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

      track("form_change", {
        ...metadata,
        ...fieldMeta,
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

  // Sets up page visibility and beforeunload listeners to detect form abandonment
  const setupGlobalListeners = () => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  };

  // Removes global listeners when no forms are being tracked
  const teardownGlobalListeners = () => {
    if (trackedForms.size === 0) {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };

  // Handle page unload for form abandonment tracking
  const handleBeforeUnload = () => {
    // Check each tracked form for abandonment
    trackedForms.forEach((formData, form) => {
      detectAbandon(form, formData);
    });
  };

  // Handle visibility change for form abandonment tracking
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      // Check each tracked form for abandonment when user switches tabs
      trackedForms.forEach((formData, form) => {
        detectAbandon(form, formData);
      });
    }
  };

  // Helper to check if a form was abandoned
  const detectAbandon = (form: HTMLFormElement, formData: FormData) => {
    // Only track abandonment if:
    // 1. The option is enabled
    // 2. The user has interacted with the form
    // 3. The form is not currently being submitted
    // 4. The form has fields that were changed/focused but not submitted
    if (
      formData.options.trackAbandon &&
      formData.hasInteracted &&
      !formData.submitting &&
      (formData.changedFields.size > 0 || formData.focusedFields.size > 0)
    ) {
      const metadata = getFormMetadata(form, formData);

      track("form_abandon", {
        ...metadata,
        fields_started: Array.from(formData.focusedFields),
        fields_changed: Array.from(formData.changedFields),
      });
    }
  };

  // Set up listeners for a specific form
  const setupFormListeners = (form: HTMLFormElement, formData: FormData) => {
    // Focus and blur for inputs, textareas and selects
    form.addEventListener("focus", handleFocus, true);
    form.addEventListener("blur", handleBlur, true);

    // Change for all inputs
    form.addEventListener("change", handleChange, true);

    // Submit for the form itself
    form.addEventListener("submit", handleSubmit);

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
      const intersectionObserver = new IntersectionObserver((entries) => {
        // Check if form is visible
        const entry = entries[0];

        // If form is not intersecting (not visible) for more than 10 seconds
        if (!entry.isIntersecting) {
          // We don't want to untrack immediately, so we'll wait a bit
          const timeoutId = setTimeout(() => {
            // Check if still tracked and still not visible
            if (trackedForms.has(form) && !document.body.contains(form)) {
              logger.debug("Form not visible for extended period, auto-untracking", {
                formId: formData.options.formId || form.id || "unnamed_form",
              });
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
      }, { threshold: 0.1 }); // 10% of the form must be visible

      intersectionObserver.observe(form);

      // Store the observer for cleanup
      formData.intersectionObserver = intersectionObserver;
    }
  };

  // Remove listeners from a specific form
  const teardownFormListeners = (form: HTMLFormElement) => {
    form.removeEventListener("focus", handleFocus, true);
    form.removeEventListener("blur", handleBlur, true);
    form.removeEventListener("change", handleChange, true);
    form.removeEventListener("submit", handleSubmit);
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

      // Default options
      const defaultOptions: FormOptions = {
        trackFocus: true,
        trackInput: true,
        trackChange: true,
        trackSubmit: true,
        trackAbandon: true,
        autoUntrack: true,
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
      teardownFormListeners(form);

      // Remove from tracked forms
      trackedForms.delete(form);

      // Remove global listeners if no forms left
      teardownGlobalListeners();

      logger.debug("Form tracking stopped", {
        formId: formData.options.formId || form.id || "unnamed_form",
      });
    },

    untrackAllForms: () => {
      trackedForms.forEach((formData, form) => {
        // Check for abandonment
        detectAbandon(form, formData);

        // Clean up observers
        cleanupFormObservers(formData);

        // Remove listeners
        teardownFormListeners(form);
      });

      // Just to be safe
      trackedForms.clear();
      teardownGlobalListeners();

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
    teardownFormListeners(form);

    // Remove from tracked forms
    trackedForms.delete(form);

    logger.debug("Form tracking stopped", {
      formId: formData.options.formId || form.id || "unnamed_form",
    });
  }
}
