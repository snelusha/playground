import { EditorView } from "@codemirror/view";

/**
 * Styling aligned with the app shell: JetBrains Mono (via `--font-sans`), light selection, no gutter chrome.
 */
export const playgroundTheme = EditorView.theme({
	"&": {
		fontSize: "13px",
		lineHeight: "22.5px",
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
		padding: "16px",
	},
	".cm-gutters": {
		backgroundColor: "transparent",
		border: "none",
		color: "var(--muted-foreground)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "transparent",
	},
	".cm-activeLine": {
		backgroundColor: "var(--muted)",
	},
	".cm-cursor, &.cm-focused .cm-cursor": {
		borderLeftColor: "#3b82f6",
	},
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
		backgroundColor: "rgba(59, 130, 246, 0.15)",
	},
	"&.cm-focused .cm-selectionBackground": {
		backgroundColor: "rgba(59, 130, 246, 0.2)",
	},
	".cm-keyword": { color: "var(--color-primary)" },
	".cm-type": { color: "#0969da" },
	".cm-string": { color: "#0a6e0a" },
	".cm-comment": { color: "var(--muted-foreground)" },
	".cm-number": { color: "#0550ae" },
	".cm-meta": { color: "#8250df" },
	".cm-atom": { color: "#953800" },
});
