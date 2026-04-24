import {
	REMOTE_FS_PROTOCOL_VERSION,
	type RemoteFsMethod,
	type RemoteFsRequest,
	type RemoteFsResponse,
} from "@/lib/fs/remote/protocol";

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	timerId: ReturnType<typeof setTimeout>;
};

type WebSocketTransportOptions = {
	url: string;
	timeoutMs?: number;
	maxInFlight?: number;
};

export class WebSocketTransport {
	private readonly url: string;
	private readonly timeoutMs: number;
	private readonly maxInFlight: number;
	private socket: WebSocket | null = null;
	private connecting: Promise<WebSocket> | null = null;
	private idCounter = 0;
	private readonly pending = new Map<string, PendingRequest>();

	constructor(options: WebSocketTransportOptions) {
		this.url = options.url;
		this.timeoutMs = options.timeoutMs ?? 5000;
		this.maxInFlight = options.maxInFlight ?? 128;
	}

	async request(method: RemoteFsMethod, params: Record<string, unknown>) {
		if (this.pending.size >= this.maxInFlight) {
			throw new Error("REMOTE_FS_BACKPRESSURE");
		}

		const socket = await this._ensureConnected();
		const id = this._nextRequestId();
		const payload: RemoteFsRequest = {
			v: REMOTE_FS_PROTOCOL_VERSION,
			id,
			method,
			params,
		} as RemoteFsRequest;

		return await new Promise<unknown>((resolve, reject) => {
			const timerId = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`REMOTE_FS_TIMEOUT:${method}`));
			}, this.timeoutMs);

			this.pending.set(id, { resolve, reject, timerId });
			socket.send(JSON.stringify(payload));
		});
	}

	private async _ensureConnected(): Promise<WebSocket> {
		if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
		if (this.connecting) return this.connecting;

		this.connecting = new Promise<WebSocket>((resolve, reject) => {
			const socket = new WebSocket(this.url);

			socket.addEventListener("open", () => {
				this.socket = socket;
				resolve(socket);
			});

			socket.addEventListener("message", (event) =>
				this._onMessage(event.data),
			);
			socket.addEventListener("close", () => this._onSocketClosed());
			socket.addEventListener("error", () => {
				reject(new Error("REMOTE_FS_SOCKET_ERROR"));
			});
		}).finally(() => {
			this.connecting = null;
		});

		return await this.connecting;
	}

	private _onMessage(data: string): void {
		let parsed: RemoteFsResponse | null = null;
		try {
			parsed = JSON.parse(data) as RemoteFsResponse;
		} catch {
			return;
		}
		if (!parsed || parsed.v !== REMOTE_FS_PROTOCOL_VERSION) return;

		const pending = this.pending.get(parsed.id);
		if (!pending) return;
		clearTimeout(pending.timerId);
		this.pending.delete(parsed.id);

		if (parsed.ok) {
			pending.resolve(parsed.result);
			return;
		}
		pending.reject(new Error(`${parsed.error.code}:${parsed.error.message}`));
	}

	private _onSocketClosed(): void {
		this.socket = null;
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timerId);
			pending.reject(new Error("REMOTE_FS_SOCKET_CLOSED"));
			this.pending.delete(id);
		}
	}

	private _nextRequestId(): string {
		this.idCounter += 1;
		return `r${Date.now()}_${this.idCounter}`;
	}
}
