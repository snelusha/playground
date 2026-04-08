import { create } from "zustand";

const EDITOR_MODE_STORAGE_KEY = "playground.editor.mode";

type EditorMode = "standard" | "vim";
export type EditorDiagnostic = {
	severity: "error" | "warning" | "info";
	message: string;
	code?: string;
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
};

function readStoredEditorMode(): EditorMode {
	if (typeof localStorage === "undefined") return "standard";
	return localStorage.getItem(EDITOR_MODE_STORAGE_KEY) === "vim"
		? "vim"
		: "standard";
}

export type EditorState = {
	output: string;
	outputOpen: boolean;
	editorMode: EditorMode;
	diagnosticsByPath: Record<string, EditorDiagnostic[]>;
};

export type EditorActions = {
	setOutput: (output: string) => void;
	clearOutput: () => void;
	openOutputWith: (output: string) => void;
	setOutputOpen: (outputOpen: boolean) => void;
	toggleOutputOpen: () => void;
	setEditorMode: (mode: EditorMode) => void;
	toggleEditorMode: () => void;
	setDiagnosticsForPath: (
		path: string,
		diagnostics: EditorDiagnostic[],
	) => void;
	clearDiagnosticsForPath: (path: string) => void;
	clearAllDiagnostics: () => void;
	reset: () => void;
};

export type EditorStore = EditorState & EditorActions;

const initial = {
	output: "",
	outputOpen: false,
	diagnosticsByPath: {},
} satisfies Omit<EditorState, "editorMode">;

export const useEditorStore = create<EditorStore>((set, get) => ({
	...initial,
	editorMode: readStoredEditorMode(),

	setOutput: (output) => set({ output }),
	clearOutput: () => set({ output: initial.output }),
	openOutputWith: (output) => set({ output, outputOpen: true }),
	setOutputOpen: (outputOpen) => set({ outputOpen }),
	toggleOutputOpen: () => set({ outputOpen: !get().outputOpen }),
	setEditorMode: (editorMode) => {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(EDITOR_MODE_STORAGE_KEY, editorMode);
		}
		set({ editorMode });
	},
	toggleEditorMode: () =>
		set((s) => {
			const editorMode: EditorMode =
				s.editorMode === "vim" ? "standard" : "vim";
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(EDITOR_MODE_STORAGE_KEY, editorMode);
			}
			return { editorMode };
		}),
	setDiagnosticsForPath: (path, diagnostics) =>
		set((s) => ({
			diagnosticsByPath: {
				...s.diagnosticsByPath,
				[path]: diagnostics,
			},
		})),
	clearDiagnosticsForPath: (path) =>
		set((s) => {
			if (!(path in s.diagnosticsByPath)) return s;
			const next = { ...s.diagnosticsByPath };
			delete next[path];
			return { diagnosticsByPath: next };
		}),
	clearAllDiagnostics: () => set({ diagnosticsByPath: {} }),
	reset: () => set({ ...initial, editorMode: readStoredEditorMode() }),
}));
