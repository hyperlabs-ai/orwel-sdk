import { createLogger, throttle } from "../utils";

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

const FORM_CONFIG = {
  MAX_FIELDS: 100,           // Límite de campos por formulario
  THROTTLE_DELAY: 500,      // Delay para throttling de eventos en ms
  MAX_TRACKED_FORMS: 10,    // Límite de formularios simultáneos
  CLEANUP_INTERVAL: 60000   // Intervalo de limpieza en ms
};

export function createFormTracker(
  track: (
    eventName: string,
    properties: Record<string, any>
  ) => { success: boolean; eventId: string },
  logger: ReturnType<typeof createLogger>
): FormTracker {
  // Store all tracked forms with a size limit
  const trackedForms = new Map<HTMLFormElement, FormData>();
  let lastCleanup = Date.now();

  // Untrack a form and clean up its resources
  const untrackForm = (form: HTMLFormElement) => {
    const formData = trackedForms.get(form);
    if (!formData) return;

    // Check for abandonment before cleanup
    detectAbandon(form, formData);

    // Cleanup all observers and listeners
    if (formData.mutationObserver) {
      formData.mutationObserver.disconnect();
    }
    if (formData.intersectionObserver) {
      formData.intersectionObserver.disconnect();
    }
    if ((formData as any).visibilityTimeoutId) {
      clearTimeout((formData as any).visibilityTimeoutId);
    }

    form.removeEventListener("focus", handleFocus, true);
    form.removeEventListener("blur", throttledHandleBlur, true);
    form.removeEventListener("change", throttledHandleChange, true);
    form.removeEventListener("submit", handleSubmit);

    trackedForms.delete(form);

    // Check if we need to remove global listeners
    if (trackedForms.size === 0) {
      teardownGlobalListeners();
    }

    logger.debug("Stopped tracking form", { 
      formId: formData.options.formId || form.id 
    });
  };

  // Cleanup function for removing stale forms
  const cleanupForms = () => {
    const now = Date.now();
    if (now - lastCleanup < FORM_CONFIG.CLEANUP_INTERVAL) return;

    for (const [form, data] of trackedForms.entries()) {
      // Remove forms that haven't been interacted with for a while
      if (!data.hasInteracted && now - data.startTime > FORM_CONFIG.CLEANUP_INTERVAL) {
        untrackForm(form);
      }
      // Remove forms that are no longer in the DOM
      if (!document.contains(form)) {
        untrackForm(form);
      }
    }
    
    lastCleanup = now;
  };

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

    // Limit size of focused fields set
    const fieldId = field.id || (field as HTMLInputElement).name || `field_${Date.now()}`;
    if (formData.focusedFields.size < FORM_CONFIG.MAX_FIELDS) {
      formData.focusedFields.add(fieldId);
    }

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

  // Throttled event handlers
  const throttledHandleChange = throttle(handleChange, FORM_CONFIG.THROTTLE_DELAY);
  const throttledHandleBlur = throttle(handleBlur, FORM_CONFIG.THROTTLE_DELAY);

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
    form.addEventListener("focus", handleFocus, true);
    form.addEventListener("blur", throttledHandleBlur, true);
    form.addEventListener("change", throttledHandleChange, true);
    form.addEventListener("submit", handleSubmit);

    // Unified MutationObserver that handles both form changes and auto-untrack
    formData.mutationObserver = new MutationObserver(
      throttle((mutations: MutationRecord[]) => {
        // Check if form was removed from DOM
        if (!document.body.contains(form)) {
          logger.debug("Form removed from DOM, auto-untracking", {
            formId: formData.options.formId || form.id || "unnamed_form",
          });
          untrackForm(form);
          return;
        }

        // Process form changes
        const hasRelevantChanges = mutations.some(mutation => 
          mutation.type === 'childList' || 
          (mutation.type === 'attributes' && 
           ['value', 'required', 'disabled'].includes(mutation.attributeName || ''))
        );

        if (hasRelevantChanges) {
          const metadata = getFormMetadata(form, formData);
          track("form_mutation", {
            ...metadata,
            mutation_count: mutations.length
          });
        }
      }, 1000)
    );

    // Observe both form changes and DOM removal
    formData.mutationObserver.observe(form, {
      childList: true,
      attributes: true,
      attributeFilter: ['value', 'required', 'disabled'],
      subtree: true
    });
    formData.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Setup intersection observer for visibility tracking
    formData.intersectionObserver = new IntersectionObserver(
      throttle((entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting && formData.hasInteracted) {
            // Si no es visible por más de 10 segundos y tiene autoUntrack, desvinculamos
            if (formData.options.autoUntrack) {
              const timeoutId = setTimeout(() => {
                if (trackedForms.has(form) && !entry.isIntersecting) {
                  detectAbandon(form, formData);
                  untrackForm(form);
                }
              }, 10000);
              (formData as any).visibilityTimeoutId = timeoutId;
            } else {
              // Si no tiene autoUntrack, solo detectamos abandono
              detectAbandon(form, formData);
            }
          } else if ((formData as any).visibilityTimeoutId) {
            clearTimeout((formData as any).visibilityTimeoutId);
            (formData as any).visibilityTimeoutId = null;
          }
        });
      }, 1000)
    );

    formData.intersectionObserver.observe(form);
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
      const formData = trackedForms.get(form);
      if (!formData) return;

      // Cleanup all observers and listeners
      if (formData.mutationObserver) {
        formData.mutationObserver.disconnect();
      }
      if (formData.intersectionObserver) {
        formData.intersectionObserver.disconnect();
      }

      form.removeEventListener("focus", handleFocus, true);
      form.removeEventListener("blur", throttledHandleBlur, true);
      form.removeEventListener("change", throttledHandleChange, true);
      form.removeEventListener("submit", handleSubmit);

      trackedForms.delete(form);
      logger.debug("Stopped tracking form", { 
        formId: formData.options.formId || form.id 
      });
    },

    untrackAllForms: () => {
      trackedForms.forEach((formData, form) => {
        // Check for abandonment
        detectAbandon(form, formData);

        // Clean up observers
        if (formData.mutationObserver) {
          formData.mutationObserver.disconnect();
        }
        if (formData.intersectionObserver) {
          formData.intersectionObserver.disconnect();
        }

        // Remove listeners
        if ((formData as any).visibilityTimeoutId) {
          clearTimeout((formData as any).visibilityTimeoutId);
        }
      });

      // Just to be safe
      trackedForms.clear();
      teardownGlobalListeners();

      logger.debug("All form tracking stopped");
    },
  };
}
