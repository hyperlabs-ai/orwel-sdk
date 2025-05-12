interface Orwel {
    init: (opts: Config) => void;
    identify: (traits: Record<string, any>) => void;
    track: (code: string, properties?: Record<string, any>) => void;
    log: (type: string, data?: Record<string, any>) => void;
    flush: () => Promise<void>;
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
