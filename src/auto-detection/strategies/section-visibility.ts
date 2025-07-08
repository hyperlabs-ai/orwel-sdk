import { SectionEngagement } from '../../types';
import { createLogger } from '../../utils';

const SECTION_DATA_ATTRIBUTE = 'data-orwel-section';

type SectionState = {
  id: string;
  element: HTMLElement;
  totalVisibilityMs: number;
  maxVisibilityPercentage: number;
  isCurrentlyVisible: boolean;
  startTime: number;
  wordCount: number;
  interactions: {
    clicks: number;
    scrollsInside: number;
  };
};

export class SectionVisibilityStrategy {
  private observer: IntersectionObserver;
  private mutationObserver: MutationObserver;
  private trackedSections: Map<HTMLElement, SectionState> = new Map();

  constructor(private logger: ReturnType<typeof createLogger>) {
    this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
      root: null,
      threshold: [0, 0.25, 0.5, 0.75, 1.0], // Umbrales para medir el % de visibilidad
    });

    this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
  }

  public initialize(): void {
    this.logger.debug('Initializing SectionVisibilityStrategy');
    this.discoverAndTrackSections(document.body);
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private discoverAndTrackSections(root: HTMLElement): void {
    const sections = root.querySelectorAll<HTMLElement>(`[${SECTION_DATA_ATTRIBUTE}]`);
    sections.forEach(section => {
      if (!this.trackedSections.has(section)) {
        this.startTracking(section);
      }
    });
  }

  private startTracking(element: HTMLElement): void {
    const sectionId = element.dataset.orwelSection;
    if (!sectionId) return;

    this.logger.debug(`Start tracking section: ${sectionId}`);
    const state: SectionState = {
      id: sectionId,
      element,
      totalVisibilityMs: 0,
      maxVisibilityPercentage: 0,
      isCurrentlyVisible: false,
      startTime: 0,
      wordCount: element.textContent?.trim().split(/\s+/).length || 0,
      interactions: {
        clicks: 0,
        scrollsInside: 0
      },
    };
    this.trackedSections.set(element, state);
    this.observer.observe(element);
  }

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach(entry => {
      const state = this.trackedSections.get(entry.target as HTMLElement);
      if (!state) return;

      // Actualizar el máximo porcentaje de visibilidad
      if (entry.intersectionRatio > state.maxVisibilityPercentage) {
        state.maxVisibilityPercentage = entry.intersectionRatio;
      }
      
      // La sección está entrando en la vista
      if (entry.isIntersecting && !state.isCurrentlyVisible) {
        state.isCurrentlyVisible = true;
        state.startTime = performance.now();
        this.logger.debug(`Section ${state.id} entered viewport.`);
      } 
      // La sección está saliendo de la vista
      else if (!entry.isIntersecting && state.isCurrentlyVisible) {
        state.isCurrentlyVisible = false;
        const elapsedTime = performance.now() - state.startTime;
        state.totalVisibilityMs += elapsedTime;
        this.logger.debug(`Section ${state.id} exited viewport. Visible for ${elapsedTime.toFixed(2)}ms.`);
      }
    });
  }

  private handleMutations(mutations: MutationRecord[]): void {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.discoverAndTrackSections(node as HTMLElement);
        }
      });
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && this.trackedSections.has(node as HTMLElement)) {
            this.stopTracking(node as HTMLElement);
        }
      });
    });
  }

  private stopTracking(element: HTMLElement) {
    this.observer.unobserve(element);
    this.trackedSections.delete(element);
    this.logger.debug(`Stopped tracking section: ${element.dataset.orwelSection}`);
  }

  public getAggregatedData(): SectionEngagement[] {
    // Asegurarse de que el tiempo de las secciones visibles actualmente se cuenta
    this.trackedSections.forEach(state => {
        if (state.isCurrentlyVisible) {
            const elapsedTime = performance.now() - state.startTime;
            state.totalVisibilityMs += elapsedTime;
            state.startTime = performance.now(); // Reiniciar para el próximo ciclo
        }
    });

    const engagementData: SectionEngagement[] = [];
    this.trackedSections.forEach(state => {
      engagementData.push({
        sectionId: state.id,
        totalVisibilityMs: Math.round(state.totalVisibilityMs),
        maxVisibilityPercentage: parseFloat(state.maxVisibilityPercentage.toFixed(2)),
        wordCount: state.wordCount,
        interactions: state.interactions,
      });
    });
    return engagementData;
  }

  public cleanup(): void {
    this.observer.disconnect();
    this.mutationObserver.disconnect();
    this.trackedSections.clear();
    this.logger.debug('SectionVisibilityStrategy cleaned up.');
  }
} 