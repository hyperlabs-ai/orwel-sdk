import { createLogger } from "../../../utils";
import { GestureEvent, GestureCollector } from "../types";
import { createMouseTracker } from "./collectors/mouse";
import { createScrollTracker } from "./collectors/scroll";
import { createKeyboardTracker } from "./collectors/keyboard";
import { createFormInteractionTracker } from "./collectors/form";
import { createNavigationTracker } from "./collectors/navigation";

/**
 * Inicializa los recolectores de gestos del usuario
 */
export function initGestureCollectors(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
) {
  logger.info("Initializing gesture collectors");
  
  // Lista de recolectores activos
  const collectors: GestureCollector[] = [];
  
  try {
    // Inicializar recolectores
    const mouseTracker = createMouseTracker(onEvent, logger);
    const scrollTracker = createScrollTracker(onEvent, logger);
    const keyboardTracker = createKeyboardTracker(onEvent, logger);
    const formTracker = createFormInteractionTracker(onEvent, logger);
    const navigationTracker = createNavigationTracker(onEvent, logger);
    
    // Agregar a la lista de recolectores activos
    collectors.push(
      mouseTracker,
      scrollTracker,
      keyboardTracker,
      formTracker,
      navigationTracker
    );
    
    // Inicializar cada recolector
    collectors.forEach(collector => collector.init());
    
    logger.success("Gesture collectors initialized");
  } catch (error) {
    logger.error("Error initializing gesture collectors", { error });
  }
  
  // Función para destruir todos los recolectores
  const destroy = () => {
    logger.info("Destroying gesture collectors");
    
    collectors.forEach(collector => {
      try {
        collector.destroy();
      } catch (error) {
        logger.error("Error destroying collector", { error });
      }
    });
    
    collectors.length = 0;
    logger.debug("All gesture collectors destroyed");
  };
  
  return {
    destroy
  };
} 