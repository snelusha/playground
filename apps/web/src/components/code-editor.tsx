import * as React from "react";

import { basicSetup } from "codemirror";
import { Compartment, Prec } from "@codemirror/state";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { clike } from "@codemirror/legacy-modes/mode/clike";
import { Vim, vim } from "@replit/codemirror-vim";

import { ShikiEditor } from "@/components/shiki-editor";

import { useEditorStore } from "@/stores/editor-store";
import { useFileTreeActions } from "@/stores/file-tree-store";

import { cn } from "@/lib/utils";

import type { KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { ballerinaLSPClient } from "./ballerina-ls";

export type EditorLanguage = "ballerina" | "toml" | "text";

type HotkeyMap = Record<string, () => void>;

interface CodeEditorProps {
	filePath?: string;
	value?: string;
	onChange?: (value: string) => void;
	hotkeys?: HotkeyMap;
	language?: EditorLanguage;
	className?: string;
}

const INDENT = "    ";

// This is a hack to bring smart indentation for Ballerina
// since there's no official CodeMirror support
const ballerinaMode = StreamLanguage.define(
	clike({
		name: "ballerina",
	}),
);

function buildHotkeyExtension(hotkeysRef: React.RefObject<HotkeyMap>) {
	const bindings: KeyBinding[] = Object.keys(hotkeysRef.current ?? {}).map(
		(key) => ({
			key,
			run: () => {
				hotkeysRef.current?.[key]?.();
				return true;
			},
		}),
	);

	return Prec.highest(keymap.of(bindings));
}

function baseExtensions(
	filePath: string,
	hotkeysRef: React.RefObject<HotkeyMap>,
): Extension[] {
	return [
		buildHotkeyExtension(hotkeysRef),
		basicSetup,
		indentUnit.of(INDENT),
		keymap.of([indentWithTab]),
		theme,
		autocompletion({
			activateOnTyping: false,
			override: [],
		}),
		ballerinaLSPClient.plugin(filePath),
	];
}

const theme = EditorView.theme({
	"&": {
		fontSize: "12.5px",
		height: "100%",
	},
	".cm-scroller": {
		fontFamily: "var(--font-sans), ui-monospace, monospace",
		overflow: "auto",
		scrollbarWidth: "none",
		msOverflowStyle: "none",
	},
	".cm-scroller::-webkit-scrollbar": {
		display: "none",
	},
	".cm-content": {
		paddingTop: "1rem",
		lineHeight: "180%",
	},
	".cm-line": {
		lineHeight: "inherit",
	},
	".cm-gutters": {
		paddingLeft: "0.5rem",
		backgroundColor: "transparent",
		border: "none",
		color: "var(--muted-foreground)",
		userSelect: "none",
	},
	".cm-activeLineGutter": {
		backgroundColor: "transparent",
	},
	".cm-activeLine": {
		backgroundColor: "transparent",
	},
	"&.cm-focused .cm-selectionBackground": {
		backgroundColor: "rgba(59, 130, 246, 0.1) !important",
	},
	".cm-matchingBracket, .cm-nonmatchingBracket": {
		outline: "none",
		borderRadius: "0",
	},
	".cm-vim-panel": {
		backgroundColor: "var(--background)",
		color: "var(--foreground)",
	},
	".cm-vim-panel input": {
		fontFamily: "var(--font-sans), ui-monospace, monospace !important",
	},
	".cm-vim-message": {
		color: "var(--muted-foreground) !important",
	},
});

export function CodeEditor({
	filePath,
	value,
	onChange,
	hotkeys = {},
	language = "ballerina",
	className,
}: CodeEditorProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const editorRef = React.useRef<ShikiEditor | null>(null);

	const languageCompartment = React.useRef(new Compartment());
	const vimCompartment = React.useRef(new Compartment());

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	const hotkeysRef = React.useRef(hotkeys);
	hotkeysRef.current = hotkeys;

	const vimEnabled = useEditorStore((s) => s.editorMode) === "vim";

	const { saveFile } = useFileTreeActions();

	const saveFileRef = React.useRef(saveFile);
	saveFileRef.current = saveFile;

	// biome-ignore lint/correctness/useExhaustiveDependencies: editor is recreated only on lang change; value is synced separately
	React.useEffect(() => {
		const parent = parentRef.current;
		if (!parent) return;

		const editor = new ShikiEditor({
			parent,
			doc: value,
			lang: language,
			themes: {
				light: "github-light",
			},
			defaultColor: "light",
			themeStyle: "cm",
			onUpdate: (update) => {
				if (update.docChanged)
					onChangeRef.current?.(update.state.doc.toString());
			},
			extensions: [
				...baseExtensions(filePath, hotkeysRef),
				languageCompartment.current.of(
					language === "ballerina" ? ballerinaMode : [],
				),
				vimCompartment.current.of(vimEnabled ? vim() : []),
			],
		});

		editorRef.current = editor;

		return () => {
			editorRef.current?.destroy();
			editorRef.current = null;
		};
	}, []);

	React.useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;
		editor.reconfigure(
			languageCompartment.current,
			language === "ballerina" ? ballerinaMode : [],
		);
	}, [language]);

	React.useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;
		editor.reconfigure(vimCompartment.current, vimEnabled ? vim() : []);
	}, [vimEnabled]);

	React.useEffect(() => {
		Vim.defineEx("write", "w", () => saveFileRef.current?.());
	}, []);

	return (
		<div
			ref={parentRef}
			className={cn(
				"relative overflow-hidden h-full min-h-37.5 cm-editor-host",
				className,
			)}
		/>
	);
}
