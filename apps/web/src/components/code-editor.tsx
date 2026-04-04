import * as React from "react";

import { basicSetup } from "codemirror";
import { Prec, type Extension } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
// import { ShikiEditor } from "@cmshiki/editor";
import { ShikiEditor } from "@/components/shiki-editor";

import { theme } from "@/lib/codemirror/theme";
import { cn } from "@/lib/utils";

import type { EditorLanguage } from "@/lib/codemirror/language";
import type { KeyBinding } from "@codemirror/view";

type HotkeyMap = Record<string, () => void>;

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	hotkeys?: HotkeyMap;
	language?: EditorLanguage;
	className?: string;
}

const INDENT = "    ";

function shikiLangFor(lang: EditorLanguage) {
	switch (lang) {
		case "ballerina":
			return "ballerina";
		case "toml":
			return "toml";
		case "text":
			return "text";
	}
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

export function CodeEditor({
	value = "",
	onChange,
	hotkeys = {},
	language = "ballerina",
	className,
}: CodeEditorProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const editorRef = React.useRef<ShikiEditor | null>(null);
	const languagePropRef = React.useRef(language);
	languagePropRef.current = language;

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	const hotkeysRef = React.useRef(hotkeys);
	hotkeysRef.current = hotkeys;

	// biome-ignore lint/correctness/useExhaustiveDependencies: single mount; value/language synced in other effects
	React.useEffect(() => {
		const parent = parentRef.current;
		if (!parent) return;

		const editor = new ShikiEditor({
			parent,
			doc: value,
			lang: shikiLangFor(languagePropRef.current),
			themes: {
				light: "github-light",
			},
			defaultColor: "light",
			themeStyle: "cm",
			onUpdate: (update) => {
				if (update.docChanged) {
					onChangeRef.current?.(update.state.doc.toString());
				}
			},
			extensions: baseExtensions(hotkeysRef),
		});

		editorRef.current = editor;

		return () => {
			editorRef.current?.destroy();
			editorRef.current = null;
		};
	}, []);

	React.useEffect(() => {
		const ed = editorRef.current;
		if (!ed) return;
		ed.update({ lang: shikiLangFor(language) });
	}, [language]);

	React.useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;

		const doc = editor.getValue();
		if (doc === value) return;

		editor.setValue(value);
	}, [value]);

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
