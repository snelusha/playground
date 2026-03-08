import { AbstractFS } from "@/lib/fs/core/abstract-fs";

export class LocalStorageFS extends AbstractFS {
	// TODO: Default key should be something unique
	constructor(private readonly key: string = "bfs") {
		super();
		this._load();
	}

	clear() {
		this.data = { isDir: true, children: {} };
		this._persist();
	}

	private _load(): void {
		try {
			const raw = localStorage.getItem(this.key);
			this.data = raw ? JSON.parse(raw) : { isDir: true, children: {} };
		} catch {
			this.data = { isDir: true, children: {} };
		}
	}

	private _persist(): void {
		try {
			localStorage.setItem(this.key, JSON.stringify(this.data));
		} catch (e) {
			console.warn("[LocalStorageFS]: Failed to persist to localStorage", e);
		}
	}

	protected override _onWrite(): void {
		this._persist();
	}
}
