import { autocompletion, completeFromList } from "@codemirror/autocomplete";
import {
	HighlightStyle,
	StreamLanguage,
	syntaxHighlighting,
} from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

/** Curated Ballerina keywords and built-in type names for highlighting and completion. */
export const BALLERINA_KEYWORDS = [
	"public",
	"private",
	"final",
	"extern",
	"remote",
	"resource",
	"service",
	"attach",
	"annotation",
	"type",
	"record",
	"table",
	"object",
	"class",
	"function",
	"worker",
	"listener",
	"client",
	"module",
	"import",
	"as",
	"const",
	"var",
	"let",
	"if",
	"else",
	"match",
	"foreach",
	"in",
	"while",
	"return",
	"break",
	"continue",
	"check",
	"checkpanic",
	"trap",
	"panic",
	"lock",
	"transaction",
	"transactional",
	"retry",
	"fail",
	"on",
	"wait",
	"commit",
	"rollback",
	"typeof",
	"is",
	"from",
	"select",
	"where",
	"order",
	"by",
	"limit",
	"join",
	"outer",
	"inner",
	"equals",
	"start",
	"true",
	"false",
	"null",
	"nil",
	"json",
	"xml",
	"anydata",
	"any",
	"never",
	"byte",
	"float",
	"decimal",
	"boolean",
	"int",
	"string",
	"handle",
	"stream",
	"future",
	"typedesc",
	"error",
	"distinct",
	"isolated",
	"readonly",
	"configurable",
	"dependson",
	"base",
	"init",
	"self",
	"new",
	"enum",
	"map",
	"do",
	"flush",
] as const;

const keywordPattern = new RegExp(
	`\\b(?:${BALLERINA_KEYWORDS.map((k) =>
		k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
	).join("|")})\\b`,
);

const ballerinaParser = simpleMode({
	start: [
		{ regex: /\s+/, token: null },
		{ regex: /\/\//, token: "comment", next: "lineComment" },
		{ regex: /\/\*/, token: "comment", next: "blockComment" },
		{
			regex: /"(?:[^"\\]|\\.)*"/,
			token: "string",
		},
		{
			regex: /'(?:[^'\\]|\\.)*'/,
			token: "string",
		},
		{
			regex: /`(?:[^`\\]|\\.)*`/,
			token: "string",
		},
		{ regex: keywordPattern, token: "keyword" },
		{ regex: /@[A-Za-z_][\w.]*/, token: "meta" },
		{
			regex:
				/\b(?:0x[\da-fA-F]+|\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?(?:[eE][+-]?\d+(?:_\d+)*)?)\b/,
			token: "number",
		},
		{ regex: /[[\]{}(),;]/, token: "bracket" },
		{ regex: /[+\-*/%=<>!]+|&&|\|\||\?\./, token: "operator" },
		{ regex: /./, token: null },
	],
	lineComment: [{ regex: /.*$/, token: "comment", next: "start" }],
	blockComment: [
		{ regex: /[\s\S]*?\*\//, token: "comment", next: "start" },
		{ regex: /[\s\S]+$/, token: "comment" },
	],
	languageData: {
		name: "ballerina",
		commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
	},
});

export const ballerinaLanguage = StreamLanguage.define(ballerinaParser);

export const tomlLanguage = StreamLanguage.define(toml);

/** GitHub-light–style colors; uses CSS variables for dark mode (see styles.css). */
const githubLightHighlight = HighlightStyle.define([
	{ tag: tags.keyword, color: "var(--cm-keyword)" },
	{ tag: tags.string, color: "var(--cm-string)" },
	{ tag: tags.comment, color: "var(--cm-comment)" },
	{ tag: tags.number, color: "var(--cm-number)" },
	{ tag: tags.meta, color: "var(--cm-meta)" },
	{ tag: tags.bracket, color: "var(--cm-bracket)" },
	{ tag: tags.operator, color: "var(--cm-operator)" },
	{ tag: tags.propertyName, color: "var(--cm-property)" },
	{ tag: tags.atom, color: "var(--cm-atom)" },
]);

export const playgroundSyntaxHighlighting = syntaxHighlighting(
	githubLightHighlight,
	{
		fallback: true,
	},
);

const ballerinaCompletions = BALLERINA_KEYWORDS.map((label) => ({
	label,
	type: "keyword" as const,
}));

export const ballerinaAutocomplete = autocompletion({
	override: [completeFromList(ballerinaCompletions)],
});

export function languageSupportFor(lang: string | undefined): Extension[] {
	switch (lang) {
		case "ballerina":
			return [
				ballerinaLanguage,
				playgroundSyntaxHighlighting,
				ballerinaAutocomplete,
			];
		case "toml":
			return [tomlLanguage, playgroundSyntaxHighlighting];
		default:
			return [playgroundSyntaxHighlighting];
	}
}
