import { EditorView } from "@codemirror/view";

/**
 * Autocomplete panel: plain white/black, no rounded corners.
 */
export const playgroundCompletionUi = EditorView.theme({
	".cm-tooltip": {
		border: "1px solid #000",
		backgroundColor: "#fff",
		color: "#000",
		borderRadius: 0,
		boxShadow: "none",
		padding: 0,
	},
	".cm-tooltip.cm-tooltip-autocomplete": {
		padding: 0,
	},
	".cm-tooltip-autocomplete > ul": {
		fontFamily: "var(--font-sans), ui-monospace, monospace",
		fontSize: "13px",
		backgroundColor: "#fff",
		border: "none",
		margin: 0,
		padding: 0,
		minWidth: "min(280px, 92vw)",
		maxWidth: "min(420px, 95vw)",
		maxHeight: "min(11.5em, 42vh)",
		overflowY: "auto",
		scrollbarWidth: "thin",
		scrollbarColor: "#000 #fff",
		"&::-webkit-scrollbar": {
			width: "8px",
		},
		"&::-webkit-scrollbar-thumb": {
			backgroundColor: "#000",
			borderRadius: 0,
		},
		"&::-webkit-scrollbar-track": {
			backgroundColor: "#fff",
		},
	},
	".cm-tooltip-autocomplete > ul > li": {
		padding: "5px 8px",
		lineHeight: 1.35,
		borderRadius: 0,
	},
	".cm-tooltip-autocomplete > ul > li:hover": {
		backgroundColor: "#fff",
		boxShadow: "inset 0 0 0 1px #000",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "#000",
		color: "#fff",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
		color: "#fff",
	},
	".cm-tooltip-autocomplete-disabled > ul > li[aria-selected]": {
		backgroundColor: "#000",
		color: "#fff",
		opacity: 0.5,
	},
	".cm-completionMatchedText": {
		textDecoration: "none",
		fontWeight: "600",
	},
	".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionMatchedText": {
		color: "inherit",
	},
	".cm-completionDetail": {
		marginLeft: "0.5em",
		color: "#000",
		fontStyle: "normal",
		fontSize: "0.85em",
	},
	".cm-completionIcon": {
		opacity: "0.5",
	},
	".cm-tooltip .cm-tooltip-arrow:before": {
		borderTopColor: "transparent",
		borderBottomColor: "transparent",
	},
	".cm-tooltip .cm-tooltip-arrow:after": {
		borderTopColor: "#fff",
		borderBottomColor: "#fff",
	},
});
