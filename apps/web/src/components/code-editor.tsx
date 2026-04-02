import * as React from "react";

import { indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { basicSetup } from "codemirror";

import { indentUnit } from "@codemirror/language";

import { githubLight } from "@fsegurai/codemirror-theme-github-light";

import { languageSupportFor } from "@/lib/codemirror/language";
import type { EditorLanguageId } from "@/lib/codemirror/language";
import { playgroundTheme } from "@/lib/codemirror/playground-theme";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	language?: string;
	className?: string;
}

function normalizeLanguage(language: string | undefined): EditorLanguageId {
	if (language === "toml") return "toml";
	if (language === "ballerina") return "ballerina";
	return "text";
}

export function CodeEditor({
	value = "",
	onChange,
	language = "ballerina",
	className,
}: CodeEditorProps) {
	const parentRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<EditorView | null>(null);
	const vimCompartment = React.useRef(new Compartment());
	const langCompartment = React.useRef(new Compartment());

	const vimEnabled = useEditorStore((s) => s.vimEnabled);

	const languageId = React.useMemo(
		() => normalizeLanguage(language),
		[language],
	);

	const langExtension = React.useMemo(
		() => languageSupportFor(languageId),
		[languageId],
	);

	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `value` is synced in a separate effect; including it here would destroy the view on every keystroke. `vimEnabled` is applied via `vimCompartment.reconfigure` in another effect.
	React.useEffect(() => {
		const parent = parentRef.current;
		if (!parent) return;

		const state = EditorState.create({
			doc: value,
			extensions: [
				vimCompartment.current.of(vimEnabled ? vim() : []),
				basicSetup,
				playgroundTheme,
				indentUnit.of("    "),
				keymap.of([indentWithTab]),
				langCompartment.current.of(langExtension),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						onChangeRef.current?.(update.state.doc.toString());
					}
				}),
				githubLight,
			],
		});

		const view = new EditorView({ state, parent });
		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// Recreate only when the CodeMirror language mode changes. `value` and
		// `vimEnabled` are read from the render that triggered this effect; `value`
		// is kept in sync by the effect below.
	}, [langExtension]);

	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: vimCompartment.current.reconfigure(vimEnabled ? vim() : []),
		});
	}, [vimEnabled]);

	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const doc = view.state.doc.toString();
		if (doc === value) return;
		view.dispatch({
			changes: { from: 0, to: doc.length, insert: value },
		});
	}, [value]);

	return (
		<div
			className={cn(
				"text-[13px] relative flex overflow-hidden h-full min-h-37.5",
				className,
			)}
		>
			<div ref={parentRef} className="relative grow min-h-0 cm-editor-host" />
		</div>
	);
}
