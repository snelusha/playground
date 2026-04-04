import { EditorView } from "@codemirror/view";

export const theme = EditorView.theme({
	"&": {
		fontSize: "14px",
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
