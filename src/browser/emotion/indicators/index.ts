import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";
import { createRageClickIndicator } from "./rage-click";
import { createFormRageIndicator } from "./form-rage";
import { createRapidScrollingIndicator } from "./rapid-scrolling";
import { createHoverIndecisionIndicator } from "./hover-indecision";
import { createErraticCursorIndicator } from "./erratic-cursor";
import { createNavLoopIndicator } from "./navigation-loop";
import { createFocusedViewIndicator } from "./focused-view";
import { createFieldHesitationIndicator } from "./field-hesitation";

interface IndicatorDetector {
  process: (events: GestureEvent[]) => IndicatorResult[];
}

/**
 * Crea la colección de detectores de indicadores
 */
export function createIndicatorDetectors(
  logger: ReturnType<typeof createLogger>
) {
  // Lista de detectores de indicadores
  const detectors: IndicatorDetector[] = [
    createRageClickIndicator(logger),
    createFormRageIndicator(logger),
    createRapidScrollingIndicator(logger),
    createHoverIndecisionIndicator(logger),
    createErraticCursorIndicator(logger),
    createNavLoopIndicator(logger),
    createFocusedViewIndicator(logger),
    createFieldHesitationIndicator(logger),
  ];

  // Procesar eventos y generar indicadores
  const processEvents = (events: GestureEvent[]): IndicatorResult[] => {
    if (events.length === 0) return [];

    // Procesar cada detector y acumular resultados
    const results: IndicatorResult[] = [];

    for (const detector of detectors) {
      try {
        const detectorResults = detector.process(events);
        if (detectorResults.length > 0) {
          results.push(...detectorResults);
        }
      } catch (error) {
        logger.error("Error in indicator detector", { error });
      }
    }

    if (results.length > 0) {
      logger.debug("Processed indicators", { count: results.length });
    }

    return results;
  };

  return {
    processEvents,
  };
}
