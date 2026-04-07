import { create } from "zustand";

const EDITOR_MODE_STORAGE_KEY = "playground.editor.mode";

type EditorMode = "standard" | "vim";

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
};

export type EditorActions = {
	setOutput: (output: string) => void;
	clearOutput: () => void;
	openOutputWith: (output: string) => void;
	setOutputOpen: (outputOpen: boolean) => void;
	toggleOutputOpen: () => void;
	setEditorMode: (mode: EditorMode) => void;
	toggleEditorMode: () => void;
	reset: () => void;
};

export type EditorStore = EditorState & EditorActions;

const initial = {
	output: "",
	outputOpen: false,
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
	reset: () => set({ ...initial, editorMode: readStoredEditorMode() }),
}));
