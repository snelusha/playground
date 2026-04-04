import * as React from "react";

import { basicSetup } from "codemirror";
import { Prec } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

import { ShikiEditor } from "@/components/shiki-editor";

import { cn } from "@/lib/utils";

import type { KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export type EditorLanguage = "ballerina" | "toml" | "text";

type HotkeyMap = Record<string, () => void>;

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	hotkeys?: HotkeyMap;
	language?: EditorLanguage;
	className?: string;
}

const INDENT = "    ";

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
});

export function CodeEditor({
	value,
	onChange,
	hotkeys = {},
	language = "ballerina",
	className,
}: CodeEditorProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const editorRef = React.useRef<ShikiEditor | null>(null);

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	const hotkeysRef = React.useRef(hotkeys);
	hotkeysRef.current = hotkeys;

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
			extensions: baseExtensions(hotkeysRef),
		});

		editorRef.current = editor;

		return () => {
			editorRef.current?.destroy();
			editorRef.current = null;
		};
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
