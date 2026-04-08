const configuredWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const configuredBackendPort = import.meta.env.VITE_BACKEND_PORT as string | undefined;
const backendPort = configuredBackendPort?.trim() || '4000';

function deriveDefaultWsUrl(port: string): string {
	if (typeof window === 'undefined') {
		return `ws://localhost:${port}/ws`;
	}

	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const host = window.location.hostname || 'localhost';
	return `${protocol}://${host}:${port}/ws`;
}

export const MARKET_WS_URL = configuredWsUrl?.trim() || deriveDefaultWsUrl(backendPort);
