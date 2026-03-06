import { AbstractFS } from "@/lib/fs/core/abstract-fs";

const STORAGE_KEY = "bfs";

export class LocalStorageFS extends AbstractFS {
    constructor() {
        super();
        this._load();
    }

    clear() {
        this.data = { isDir: true, children: {} };
        this._persist();
    }

    private _load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this.data = raw ? JSON.parse(raw) : { isDir: true, children: {} };
        } catch {
            this.data = { isDir: true, children: {} };
        }
    }

    private _persist(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn(
                "[LocalStorageFS]: Failed to persist to localStorage",
                e,
            );
        }
    }

    protected override _onWrite(): void {
        this._persist();
    }
}
