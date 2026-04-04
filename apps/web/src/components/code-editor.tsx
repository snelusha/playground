import * as React from "react";

import { basicSetup } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

import { githubLight } from "@fsegurai/codemirror-theme-github-light";

import { theme } from "@/lib/codemirror/theme";
import { languageSupportFor } from "@/lib/codemirror/language";
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

function buildExtensions(
	langCompartment: Compartment,
	langExtension: ReturnType<typeof languageSupportFor>,
	hotkeysRef: React.RefObject<HotkeyMap>,
	onChangeRef: React.RefObject<((value: string) => void) | undefined>,
) {
	return [
		buildHotkeyExtension(hotkeysRef),
		basicSetup,
		indentUnit.of(INDENT),
		keymap.of([indentWithTab]),
		langCompartment.of(langExtension),
		theme,
		githubLight,
		autocompletion({
			activateOnTyping: false,
			override: [],
		}),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				onChangeRef.current?.(update.state.doc.toString());
			}
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
	const editorViewRef = React.useRef<EditorView | null>(null);
	const languageCompartment = React.useRef(new Compartment());

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	const hotkeysRef = React.useRef(hotkeys);
	hotkeysRef.current = hotkeys;

	const languageExtension = React.useMemo(
		() => languageSupportFor(language) ?? [],
		[language],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: editor is recreated only on lang change; value is synced separately
	React.useEffect(() => {
		const parent = parentRef.current;
		if (!parent) return;

		const state = EditorState.create({
			doc: value,
			extensions: buildExtensions(
				languageCompartment.current,
				languageExtension,
				hotkeysRef,
				onChangeRef,
			),
		});

		const editorView = new EditorView({ state, parent });
		editorViewRef.current = editorView;

		return () => {
			editorView.destroy();
			editorViewRef.current = null;
		};
	}, [languageExtension]);

	React.useEffect(() => {
		const editorView = editorViewRef.current;
		if (!editorView) return;

		const doc = editorView.state.doc.toString();
		if (doc === value) return;

		editorView.dispatch({
			changes: { from: 0, to: doc.length, insert: value },
		});
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
