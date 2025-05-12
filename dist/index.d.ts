interface Orwel {
    init: (opts: Config) => void;
    identify: (traits: Record<string, any>) => {
        success: boolean;
        visitorId: string;
    };
    track: (code: string, properties?: Record<string, any>) => {
        success: boolean;
        eventId: string;
    };
    log: (type: string, data?: Record<string, any>) => {
        success: boolean;
        logId: string;
    };
    flush: () => Promise<{
        success: boolean;
        count: number;
    }>;
}
interface Config {
    apiKey: string;
    workspace?: string;
    [key: string]: any;
}
declare global {
    interface Window {
        orwel: Orwel;
    }
}
declare const orwel: Orwel;
export { orwel };
