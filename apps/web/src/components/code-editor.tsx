import * as React from "react";

import { basicSetup } from "codemirror";
import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { languageSupportFor } from "@/lib/codemirror/ballerina-language";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	language?: string;
	className?: string;
}

const languageConf = new Compartment();

function baseExtensions(
	language: string | undefined,
	onDocChange: (text: string) => void,
): Extension[] {
	return [
		basicSetup,
		indentUnit.of("  "),
		EditorView.contentAttributes.of({
			spellcheck: "false",
			autocapitalize: "off",
			autocomplete: "off",
			autocorrect: "off",
		}),
		languageConf.of(languageSupportFor(language)),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) onDocChange(update.state.doc.toString());
		}),
		EditorView.theme({
			"&": { height: "100%" },
			".cm-editor": {
				backgroundColor: "var(--background)",
				color: "var(--foreground)",
			},
			".cm-scroller": {
				fontFamily: "inherit",
			},
			".cm-content": {
				padding: "16px",
				fontSize: "13px",
				lineHeight: "22.5px",
				minHeight: "100%",
			},
			".cm-gutters": {
				backgroundColor: "var(--muted)",
				borderColor: "var(--border)",
				borderRightWidth: "1px",
			},
			".cm-activeLineGutter": {
				backgroundColor: "transparent",
			},
		}),
	];
}

export function CodeEditor({
	value = "",
	onChange,
	language = "ballerina",
	className,
}: CodeEditorProps) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<EditorView | null>(null);
	const onChangeRef = React.useRef(onChange);
	const valueRef = React.useRef(value);
	const languageRef = React.useRef(language);
	onChangeRef.current = onChange;
	valueRef.current = value;
	languageRef.current = language;

	React.useEffect(() => {
		const parent = containerRef.current;
		if (!parent) return;

		const state = EditorState.create({
			doc: valueRef.current,
			extensions: baseExtensions(languageRef.current, (text) => {
				onChangeRef.current?.(text);
			}),
		});

		const view = new EditorView({ state, parent });
		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: languageConf.reconfigure(languageSupportFor(language)),
		});
	}, [language]);

	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const cur = view.state.doc.toString();
		if (cur === value) return;
		view.dispatch({
			changes: { from: 0, to: cur.length, insert: value },
			selection: { anchor: 0 },
		});
	}, [value]);

	return (
		<div
			className={cn(
				"text-[13px] relative flex overflow-hidden h-full min-h-37.5",
				className,
			)}
		>
			<div ref={containerRef} className="relative grow min-h-0 min-w-0" />
		</div>
	);
}
