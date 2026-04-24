import type {
	DirEntry,
	FS,
	OpenResult,
	StatResult,
} from "@/lib/fs/core/fs.interface";
import { WebSocketTransport } from "@/lib/fs/remote/ws-transport";

type RemoteFsOptions = {
	url: string;
	timeoutMs?: number;
	maxInFlight?: number;
};

export class RemoteFS implements FS {
	private readonly transport: WebSocketTransport;

	constructor(options: RemoteFsOptions) {
		this.transport = new WebSocketTransport(options);
	}

	async open(path: string): Promise<OpenResult | null> {
		return await this._requestOrFallback<OpenResult | null>(
			"open",
			{ path },
			null,
		);
	}

	async stat(path: string): Promise<StatResult | null> {
		return await this._requestOrFallback<StatResult | null>(
			"stat",
			{ path },
			null,
		);
	}

	async readDir(path: string): Promise<DirEntry[] | null> {
		return await this._requestOrFallback<DirEntry[] | null>(
			"readDir",
			{ path },
			null,
		);
	}

	async writeFile(path: string, content: string): Promise<boolean> {
		return await this._requestOrFallback<boolean>(
			"writeFile",
			{ path, content },
			false,
		);
	}

	async remove(path: string): Promise<boolean> {
		return await this._requestOrFallback<boolean>("remove", { path }, false);
	}

	async move(oldPath: string, newPath: string): Promise<boolean> {
		return await this._requestOrFallback<boolean>(
			"move",
			{ oldPath, newPath },
			false,
		);
	}

	async mkdirAll(path: string): Promise<boolean> {
		return await this._requestOrFallback<boolean>("mkdirAll", { path }, false);
	}

	private async _requestOrFallback<T>(
		method: Parameters<WebSocketTransport["request"]>[0],
		params: Record<string, unknown>,
		fallback: T,
	): Promise<T> {
		try {
			return (await this.transport.request(method, params)) as T;
		} catch {
			return fallback;
		}
	}
}
