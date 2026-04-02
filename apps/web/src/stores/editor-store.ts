import { create } from "zustand";

const VIM_STORAGE_KEY = "playground.editor.vim";

function readStoredVim(): boolean {
	if (typeof localStorage === "undefined") return false;
	return localStorage.getItem(VIM_STORAGE_KEY) === "1";
}

export type EditorState = {
	output: string;
	outputOpen: boolean;
	vimEnabled: boolean;
};

export type EditorActions = {
	setOutput: (output: string) => void;
	clearOutput: () => void;
	openOutputWith: (output: string) => void;
	setOutputOpen: (outputOpen: boolean) => void;
	toggleOutputOpen: () => void;
	toggleVim: () => void;
	reset: () => void;
};

export type EditorStore = EditorState & EditorActions;

const initial: EditorState = {
	output: "",
	outputOpen: false,
	vimEnabled: readStoredVim(),
};

export const useEditorStore = create<EditorStore>((set, get) => ({
	...initial,

	setOutput: (output) => set({ output }),
	clearOutput: () => set({ output: initial.output }),
	openOutputWith: (output) => set({ output, outputOpen: true }),
	setOutputOpen: (outputOpen) => set({ outputOpen }),
	toggleOutputOpen: () => set({ outputOpen: !get().outputOpen }),
	toggleVim: () =>
		set((s) => {
			const vimEnabled = !s.vimEnabled;
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(VIM_STORAGE_KEY, vimEnabled ? "1" : "0");
			}
			return { vimEnabled };
		}),
	reset: () => set(initial),
}));
