import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";

/**
 * Crea un recolector de eventos de navegación
 */
export function createNavigationTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Estado para tracking
  let isTracking = false;
  let navigationHistory: { url: string; timestamp: number; title: string }[] = [];
  let pageVisitStart = Date.now();
  
  // Función para manejar clicks en enlaces
  const handleLinkClick = (e: MouseEvent) => {
    // Buscar si el click fue en un enlace o dentro de uno
    let target = e.target as HTMLElement;
    let linkElement: HTMLAnchorElement | null = null;
    
    // Buscar el enlace más cercano en la jerarquía de elementos
    while (target && !linkElement) {
      if (target.tagName.toLowerCase() === 'a') {
        linkElement = target as HTMLAnchorElement;
      } else {
        target = target.parentElement as HTMLElement;
      }
    }
    
    if (linkElement) {
      const now = Date.now();
      const href = linkElement.href || '';
      const isInternal = isInternalLink(href);
      
      onEvent({
        type: 'link_click',
        timestamp: now,
        data: {
          url: href,
          text: linkElement.textContent?.trim() || '',
          isInternal,
          timeOnPage: now - pageVisitStart
        }
      });
    }
  };
  
  // Función para manejar cambios de URL (history API)
  const handleHistoryChange = () => {
    const now = Date.now();
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;
    const currentTitle = document.title;
    
    // Si es la primera navegación, no hay navegación anterior para analizar
    if (navigationHistory.length > 0) {
      const previousNavigation = navigationHistory[navigationHistory.length - 1];
      const timeOnPreviousPage = now - previousNavigation.timestamp;
      
      // Verificar si estamos volviendo a una página previamente visitada
      const isLoop = navigationHistory.some((nav, index) => 
        index < navigationHistory.length - 1 && // No la última entrada
        nav.url === currentUrl // URL coincide
      );
      
      if (isLoop) {
        // Detectar patrón de navegación en bucle (ida y vuelta repetida)
        onEvent({
          type: 'navigation_loop',
          timestamp: now,
          data: {
            currentUrl,
            previousUrl: previousNavigation.url,
            timeOnPreviousPage,
            visitCount: navigationHistory.filter(nav => nav.url === currentUrl).length + 1
          }
        });
      }
      
      // Agregar evento de navegación
      onEvent({
        type: 'navigation',
        timestamp: now,
        data: {
          fromUrl: previousNavigation.url,
          toUrl: currentUrl,
          timeOnPreviousPage,
          isLoop
        }
      });
    }
    
    // Agregar a historial
    navigationHistory.push({
      url: currentUrl,
      timestamp: now,
      title: currentTitle
    });
    
    // Limitar tamaño del historial
    if (navigationHistory.length > 50) {
      navigationHistory.shift();
    }
    
    // Actualizar timestamp de inicio de visita de página
    pageVisitStart = now;
  };
  
  // Función para verificar si un enlace es interno (mismo dominio)
  const isInternalLink = (url: string): boolean => {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      const currentHost = window.location.hostname;
      
      return urlObj.hostname === currentHost;
    } catch (error) {
      // Si no es una URL válida, asumir que es una ruta relativa (interna)
      return true;
    }
  };
  
  // Configurar manejadores para API History
  const setupHistoryHandlers = () => {
    // Guardar referencias a los métodos originales
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    // Sobrescribir pushState
    window.history.pushState = function (...args) {
      // Llamar método original
      originalPushState.apply(this, args);
      // Manejar el cambio
      handleHistoryChange();
    };
    
    // Sobrescribir replaceState
    window.history.replaceState = function (...args) {
      // Llamar método original
      originalReplaceState.apply(this, args);
      // Manejar el cambio
      handleHistoryChange();
    };
    
    // Guardar referencias para restaurar después
    (window as any).__orwelOriginalPushState = originalPushState;
    (window as any).__orwelOriginalReplaceState = originalReplaceState;
  };
  
  // Restaurar manejadores originales de History
  const restoreHistoryHandlers = () => {
    if ((window as any).__orwelOriginalPushState) {
      window.history.pushState = (window as any).__orwelOriginalPushState;
      delete (window as any).__orwelOriginalPushState;
    }
    
    if ((window as any).__orwelOriginalReplaceState) {
      window.history.replaceState = (window as any).__orwelOriginalReplaceState;
      delete (window as any).__orwelOriginalReplaceState;
    }
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Registrar la página actual como punto de partida
      const currentUrl = window.location.href;
      const currentTitle = document.title;
      
      navigationHistory.push({
        url: currentUrl,
        timestamp: Date.now(),
        title: currentTitle
      });
      
      // Añadir event listeners
      document.addEventListener('click', handleLinkClick);
      window.addEventListener('popstate', handleHistoryChange);
      
      // Configurar interceptores para History API
      setupHistoryHandlers();
      
      isTracking = true;
      logger.debug("Navigation tracker initialized");
    } catch (error) {
      logger.error("Failed to initialize navigation tracker", { error });
    }
  };
  
  // Detener el tracking
  const destroy = () => {
    if (!isTracking) return;
    
    try {
      // Eliminar event listeners
      document.removeEventListener('click', handleLinkClick);
      window.removeEventListener('popstate', handleHistoryChange);
      
      // Restaurar métodos originales de History
      restoreHistoryHandlers();
      
      navigationHistory = [];
      isTracking = false;
      logger.debug("Navigation tracker destroyed");
    } catch (error) {
      logger.error("Failed to destroy navigation tracker", { error });
    }
  };
  
  return {
    init,
    destroy
  };
} 