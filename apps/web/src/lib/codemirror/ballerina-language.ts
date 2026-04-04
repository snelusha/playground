import { StreamLanguage } from "@codemirror/language";
import { clike } from "@codemirror/legacy-modes/mode/clike";

interface Stream {
	eol: () => boolean;
	sol: () => boolean;
	peek: () => string | null;
	next: () => string | null;
	eat: (match: string | RegExp) => string | false;
	eatWhile: (match: string | RegExp) => boolean;
	match: (pattern: string | RegExp, consume?: boolean) => string[] | boolean;
	skipTo: (ch: string) => boolean;
	skipToEnd: () => void;
	backUp: (n: number) => void;
	column: () => number;
	indentation: () => number;
	current: () => string;
}

interface State {
	tokenize: ((stream: Stream, state: State) => string) | null;
}

type TokenizerFn = (stream: Stream, state: State) => string;

function words(...strs: string[]): Record<string, boolean> {
	const obj: Record<string, boolean> = {};
	for (const str of strs) {
		for (const w of str.trim().split(/\s+/)) {
			if (w) obj[w] = true;
		}
	}
	return obj;
}

function tokenSingleDoubleString(stream: Stream, state: State): string {
	let escaped = false;
	while (!stream.eol()) {
		const ch = stream.next();
		if (ch === '"' && !escaped) {
			state.tokenize = null;
			break;
		}
		escaped = !escaped && ch === "\\";
	}
	return "string";
}

function tokenTripleDoubleString(stream: Stream, state: State): string {
	while (!stream.eol()) {
		if (stream.match('"""')) {
			state.tokenize = null;
			break;
		}

		const ch = stream.next();

		if (ch === "$" && stream.peek() === "{") {
			stream.next();
			let depth = 1;
			while (depth > 0 && !stream.eol()) {
				const c = stream.next();
				if (c === "{") depth++;
				else if (c === "}") depth--;
			}
		}
	}
	return "string";
}

function tokenBacktickString(stream: Stream, state: State): string {
	let escaped = false;
	while (!stream.eol()) {
		const ch = stream.next();

		if (ch === "`" && !escaped) {
			state.tokenize = null;
			break;
		}

		if (!escaped && ch === "$" && stream.peek() === "{") {
			stream.next();
			let depth = 1;
			while (depth > 0 && !stream.eol()) {
				const c = stream.next();
				if (c === "{") depth++;
				else if (c === "}") depth--;
			}
		}

		escaped = !escaped && ch === "\\";
	}
	return "string";
}

function tokenXmlTemplate(stream: Stream, state: State): string {
	while (!stream.eol()) {
		const ch = stream.next();
		if (ch === "`") {
			state.tokenize = null;
			break;
		}
	}
	return "tag";
}

function tokenRegexTemplate(stream: Stream, state: State): string {
	while (!stream.eol()) {
		const ch = stream.next();
		if (ch === "`") {
			state.tokenize = null;
			break;
		}
	}
	return "string-2";
}

const KEYWORDS = words(
	"public private",

	"remote abstract client isolated readonly distinct",

	"import function const listener service xmlns annotation type record object class enum",

	"as on resource final source worker parameter field",
	"returns return external",
	"if else while check checkpanic panic continue break typeof is",
	"lock fork trap in foreach table key let new from where select start flush",
	"configurable wait do transaction transactional commit rollback retry",
	"base16 base64 match conflict limit join outer equals order by ascending descending",
	"natural group collect fail",
);

const TYPES = words(
	"int byte float decimal string boolean xml json handle any anydata never",
	"var map future typedesc error stream",
);

const BLOCK_KEYWORDS = words(
	"function service if else while foreach match transaction lock try fail do",
);

const DEF_KEYWORDS = words(
	"function type class record listener const service object var let enum",
);

const ATOMS = words("true false null");

const hooks: Record<string, (stream: Stream, state: State) => string | false> =
	{
		"@"(stream) {
			stream.eatWhile(/[\w$]/);
			return "meta";
		},

		'"'(stream, state) {
			if (stream.match('""')) {
				state.tokenize = tokenTripleDoubleString as TokenizerFn;
				return tokenTripleDoubleString(stream, state);
			}
			state.tokenize = tokenSingleDoubleString as TokenizerFn;
			return tokenSingleDoubleString(stream, state);
		},

		"`"(stream, state) {
			state.tokenize = tokenBacktickString as TokenizerFn;
			return tokenBacktickString(stream, state);
		},

		x(stream, state) {
			if (stream.current?.() === "xml" && stream.peek() === "`") {
				stream.next();
				state.tokenize = tokenXmlTemplate as TokenizerFn;
				return tokenXmlTemplate(stream, state);
			}
			return false;
		},

		r(stream, state) {
			if (stream.current?.() === "re" && stream.peek() === "`") {
				stream.next();
				state.tokenize = tokenRegexTemplate as TokenizerFn;
				return tokenRegexTemplate(stream, state);
			}
			return false;
		},
	};

type CliktOptions = Parameters<typeof clike>[0];

interface BallerinaOptions extends CliktOptions {
	defKeywords: Record<string, boolean>;
	languageData: {
		closeBrackets: { brackets: string[] };
		commentTokens: {
			line: string;
			block: { open: string; close: string };
		};
	};
}

const ballerinaOptions: BallerinaOptions = {
	name: "ballerina",
	keywords: KEYWORDS,
	types: TYPES,
	blockKeywords: BLOCK_KEYWORDS,
	defKeywords: DEF_KEYWORDS,
	atoms: ATOMS,
	multiLineStrings: true,
	isOperatorChar: /[+\-*&%=<>!?|^~/:]/,
	hooks,
	languageData: {
		closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
		commentTokens: {
			line: "//",
			block: { open: "/*", close: "*/" },
		},
	},
};

const ballerinaMode = clike(ballerinaOptions as CliktOptions);

export const ballerinaLanguage = StreamLanguage.define(ballerinaMode);
