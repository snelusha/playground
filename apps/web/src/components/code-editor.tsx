import * as React from "react";

import { basicSetup } from "codemirror";
import { EditorSelection, Prec } from "@codemirror/state";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { clike } from "@codemirror/legacy-modes/mode/clike";

import { ShikiEditor } from "@/components/shiki-editor";

import { cn } from "@/lib/utils";

import type { EditorLanguage } from "@/lib/codemirror/language";
import type { KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

type HotkeyMap = Record<string, () => void>;

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	hotkeys?: HotkeyMap;
	language?: EditorLanguage;
	className?: string;
}

const INDENT = "    ";

// const ballerinaLanguage = StreamLanguage.define(
// 	clike({
// 		name: "ballerina",
// 		languageData: {
// 			// closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
// 			// commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
// 		},
// 	} as Parameters<typeof clike>[0] & {
// 		languageData: Record<string, unknown>;
// 	}),
// );

const ballerinaLanguage = StreamLanguage.define(
	clike({
		name: "ballerina",
	} as Parameters<typeof clike>[0] & {
		languageData: Record<string, unknown>;
	}),
);

function isWhitespace(char: string) {
	return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isBetweenBraces(view: EditorView, pos: number) {
	const { state } = view;
	const doc = state.doc;

	if (pos <= 0 || pos >= doc.length) return false;

	let beforePos = pos - 1;
	while (beforePos >= 0) {
		const ch = doc.sliceString(beforePos, beforePos + 1);
		if (!isWhitespace(ch)) {
			if (ch !== "{") return false;
			break;
		}
		beforePos--;
	}
	if (beforePos < 0) return false;

	let afterPos = pos;
	while (afterPos < doc.length) {
		const ch = doc.sliceString(afterPos, afterPos + 1);
		if (!isWhitespace(ch)) {
			if (ch !== "}") return false;
			break;
		}
		afterPos++;
	}
	if (afterPos >= doc.length) return false;

	return true;
}

function smartEnter(view: EditorView): boolean {
	const { state } = view;

	// Only handle when all cursors are between braces; otherwise, fall back.
	if (
		!state.selection.ranges.every(
			(range) => range.empty && isBetweenBraces(view, range.from),
		)
	) {
		return false;
	}

	const transaction = state.changeByRange((range) => {
		const pos = range.from;
		const line = state.doc.lineAt(pos);
		const lineIndentMatch = line.text.match(/^\s*/);
		const baseIndent = lineIndentMatch ? lineIndentMatch[0] : "";

		const insert = `\n${baseIndent}${INDENT}\n${baseIndent}`;
		const insertFrom = pos;
		const insertTo = pos;

		const cursorPos = insertFrom + 1 + baseIndent.length + INDENT.length;

		return {
			changes: { from: insertFrom, to: insertTo, insert },
			range: EditorSelection.cursor(cursorPos),
		};
	});

	view.dispatch(transaction);
	return true;
}

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
	hotkeysRef: React.RefObject<HotkeyMap>,
	language: EditorLanguage,
): Extension[] {
	const languageExtensions: Extension[] =
		language === "ballerina" ? [ballerinaLanguage] : [];

	return [
		buildHotkeyExtension(hotkeysRef),
		// Prec.highest(
		// 	keymap.of([
		// 		{
		// 			key: "Enter",
		// 			run: smartEnter,
		// 		},
		// 	]),
		// ),
		basicSetup,
		indentUnit.of(INDENT),
		keymap.of([indentWithTab]),
		theme,
		autocompletion({
			activateOnTyping: false,
			override: [],
		}),
		...languageExtensions,
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
			extensions: baseExtensions(hotkeysRef, language),
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
