import * as React from "react";

import { basicSetup } from "codemirror";
import { Compartment, Prec } from "@codemirror/state";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { type Diagnostic, linter } from "@codemirror/lint";
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
import type { Text } from "@codemirror/state";
import type { EditorDiagnostic } from "@/stores/editor-store";

export type EditorLanguage = "ballerina" | "toml" | "text";

type HotkeyMap = Record<string, () => void>;

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	hotkeys?: HotkeyMap;
	language?: EditorLanguage;
	diagnostics?: EditorDiagnostic[];
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

function baseExtensions(hotkeysRef: React.RefObject<HotkeyMap>): Extension[] {
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
	value,
	onChange,
	hotkeys = {},
	language = "ballerina",
	diagnostics = [],
	className,
}: CodeEditorProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const editorRef = React.useRef<ShikiEditor | null>(null);

	const languageCompartment = React.useRef(new Compartment());
	const vimCompartment = React.useRef(new Compartment());
	const lintCompartment = React.useRef(new Compartment());

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	const hotkeysRef = React.useRef(hotkeys);
	hotkeysRef.current = hotkeys;
	const diagnosticsRef = React.useRef<EditorDiagnostic[]>(diagnostics);
	diagnosticsRef.current = diagnostics;

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
				...baseExtensions(hotkeysRef),
				languageCompartment.current.of(
					language === "ballerina" ? ballerinaMode : [],
				),
				vimCompartment.current.of(vimEnabled ? vim() : []),
				lintCompartment.current.of(
					linter(
						(view) =>
							toCodeMirrorDiagnostics(view.state.doc, diagnosticsRef.current),
						{
							needsRefresh: () => true,
						},
					),
				),
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
		const editor = editorRef.current;
		if (!editor) return;
		editor.reconfigure(
			lintCompartment.current,
			linter((view) => toCodeMirrorDiagnostics(view.state.doc, diagnostics), {
				needsRefresh: () => true,
			}),
		);
	}, [diagnostics]);

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

function toCodeMirrorDiagnostics(
	doc: Text,
	diagnostics: EditorDiagnostic[],
): Diagnostic[] {
	return diagnostics.map((diagnostic) => {
		const from = lineColToOffset(
			doc,
			diagnostic.startLine,
			diagnostic.startCol,
		);
		const rawTo = lineColToOffset(doc, diagnostic.endLine, diagnostic.endCol);
		const to = rawTo > from ? rawTo : Math.min(from + 1, doc.length);
		return {
			from,
			to,
			severity: diagnostic.severity,
			message: diagnostic.code
				? `[${diagnostic.code}] ${diagnostic.message}`
				: diagnostic.message,
		};
	});
}

function lineColToOffset(doc: Text, line: number, col: number): number {
	if (doc.lines === 0) return 0;
	const lineNumber = clamp(line + 1, 1, doc.lines);
	const lineInfo = doc.line(lineNumber);
	const safeCol = clamp(col, 0, lineInfo.length);
	return lineInfo.from + safeCol;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
