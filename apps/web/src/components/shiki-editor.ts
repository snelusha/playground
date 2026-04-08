import {
	type Text,
	Compartment,
	RangeSet,
	RangeSetBuilder,
	StateEffect,
	type Extension,
} from "@codemirror/state";
import {
	type DecorationSet,
	type EditorViewConfig,
	type ViewUpdate,
	Decoration,
	EditorView,
	ViewPlugin,
} from "@codemirror/view";
import { createHighlighter } from "shiki";
import { StyleModule } from "style-mod";

import type { StyleSpec } from "style-mod";

type ThemeRegistry = Record<string, string | Record<string, unknown>>;

type Highlighter = Record<string, unknown>;

type InitShikiFn = (
	options: Omit<ShikiToCMOptions, "theme">,
) => Promise<Highlighter>;

interface Options<TThemes extends ThemeRegistry = ThemeRegistry> {
	lang?: string | unknown;
	theme?: string;
	themes?: TThemes;
	themeStyle?: "cm" | "shiki";
	defaultColor?: (keyof TThemes & string) | (string & {}) | false;
	langAlias?: Record<string, string>;
	warnings?: boolean;
	versionGuard?: boolean;
	cssVariablePrefix?: string;
	tokenizeMaxLineLength?: number;
	includeExplanation?: boolean;
	tokenizeTimeLimit?: number;
	highlighter?: Highlighter;
	resolveLang?: unknown;
	resolveTheme?: unknown;
}

interface ShikiToCMOptions<TThemes extends ThemeRegistry = ThemeRegistry>
	extends Required<
		Omit<
			Options<TThemes>,
			| "theme"
			| "langAlias"
			| "colorReplacements"
			| "grammarState"
			| "grammarContextCode"
			| "highlighter"
			| "versionGuard"
			| "resolveLang"
			| "resolveTheme"
		>
	> {
	lang: string | unknown;
	langAlias?: Record<string, string>;
	highlighter?: Highlighter;
	versionGuard?: boolean;
	resolveLang?: unknown;
	resolveTheme?: unknown;
}

export interface ShikiEditorOptions<
	TThemes extends ThemeRegistry = ThemeRegistry,
> extends Omit<EditorViewConfig, "extensions" | "doc" | "parent"> {
	parent: HTMLElement;
	doc?: string;
	extensions?: Extension | readonly Extension[];
	lang: string | unknown;
	/** Single-theme shorthand; merged into `themes.light` by the bridge if used */
	theme?: string;
	themes?: TThemes;
	defaultColor?: Options<TThemes>["defaultColor"];
	themeStyle?: "cm" | "shiki";
	onUpdate?: (update: ViewUpdate) => void;
}

interface ThemeSettings {
	background?: string;
	backgroundImage?: string;
	foreground?: string;
	caret?: string;
	selection?: string;
	selectionMatch?: string;
	lineHighlight?: string;
	gutterBackground?: string;
	gutterForeground?: string;
	gutterActiveForeground?: string;
	gutterBorder?: string;
	fontFamily?: string;
	fontSize?: StyleSpec["fontSize"];
}

interface CreateThemeOptions {
	theme: "light" | "dark";
	settings: ThemeSettings;
	classes?: { [selector: string]: StyleSpec };
}

function getClasses(view: EditorView): string[] {
	return view.themeClasses.split(" ").filter((id) => !!id.trim());
}

function mountStyles(
	view: EditorView,
	spec: { [selector: string]: StyleSpec },
	scopes?: Record<string, string>,
) {
	return StyleModule.mount(
		view.root,
		new StyleModule(spec, {
			finish(sel) {
				const main = `.${getClasses(view)[0]}`;
				return /&/.test(sel)
					? sel.replace(/&\w*/, (m) => {
							if (m === "&") return main;
							if (!scopes?.[m])
								throw new RangeError(`Unsupported selector: ${m}`);
							return scopes[m];
						})
					: `${main} ${sel}`;
			},
		}),
	);
}

function newStyleModuleName(): string {
	return StyleModule.newName();
}

function createTheme({
	theme,
	settings,
	classes,
}: CreateThemeOptions): Extension {
	settings = {
		caret: "#FFFFFF",
		...settings,
	};
	let themeOptions: Record<string, StyleSpec> = {
		".cm-gutters": {},
	};
	const baseStyle: StyleSpec = {};
	if (settings.background) baseStyle.backgroundColor = settings.background;
	if (settings.backgroundImage)
		baseStyle.backgroundImage = settings.backgroundImage;
	if (settings.foreground) baseStyle.color = settings.foreground;
	if (settings.fontSize) baseStyle.fontSize = settings.fontSize;
	if (settings.background || settings.foreground) {
		themeOptions["&"] = baseStyle;
	}
	if (settings.fontFamily) {
		themeOptions["&.cm-editor .cm-scroller"] = {
			fontFamily: settings.fontFamily,
		};
	}
	if (settings.gutterBackground) {
		themeOptions[".cm-gutters"].backgroundColor = settings.gutterBackground;
	}
	if (settings.gutterForeground) {
		themeOptions[".cm-gutters"].color = settings.gutterForeground;
	}
	if (settings.gutterBorder) {
		themeOptions[".cm-gutters"].borderRightColor = settings.gutterBorder;
	}
	if (settings.caret) {
		themeOptions[".cm-content"] = { caretColor: settings.caret };
		themeOptions[".cm-cursor, .cm-dropCursor"] = {
			borderLeftColor: settings.caret,
		};
	}
	const activeLineGutterStyle: StyleSpec = {};
	if (settings.gutterActiveForeground) {
		activeLineGutterStyle.color = settings.gutterActiveForeground;
	}
	const cmEditorStyle: StyleSpec = {};
	if (settings.lineHighlight) {
		cmEditorStyle["& .cm-activeLine"] = {
			backgroundColor: "transparent",
		};
		activeLineGutterStyle.backgroundColor = settings.lineHighlight;
	}
	themeOptions[".cm-activeLineGutter"] = activeLineGutterStyle;
	if (settings.selection) {
		cmEditorStyle["& .cm-selectionLayer"] = { zIndex: 2 };
		cmEditorStyle["& .cm-cursorLayer"] = { zIndex: 3 };
		cmEditorStyle["& .cm-line"] = {
			"& ::selection, &::selection": { backgroundColor: settings.selection },
			"& span::selection": { backgroundColor: settings.selection },
		};
		cmEditorStyle[
			"& .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground"
		] = {
			backgroundColor: `${settings.selection} !important`,
		};
		cmEditorStyle[
			"&:has(.cm-selectionLayer .cm-selectionBackground) .cm-activeLine"
		] = {
			backgroundColor: "transparent !important",
		};
	}
	if (Object.keys(cmEditorStyle).length > 0) {
		themeOptions["&.cm-editor"] = cmEditorStyle;
	}
	if (settings.selectionMatch) {
		themeOptions["& .cm-selectionMatch"] = {
			backgroundColor: settings.selectionMatch,
		};
	}
	if (classes) themeOptions = { ...themeOptions, ...classes };
	return EditorView.theme(themeOptions, { dark: theme === "dark" });
}

function toStyleObject(styleStr: string, isBgStyle = false, important = false) {
	const Styles: Record<string, string> = {};
	const suffix = important ? " !important" : "";
	for (const part of styleStr.split(";")) {
		const [k, v] = part.split(":");
		if (k && v) Styles[k.trim()] = `${v.trim()}${suffix}`;
		else if (isBgStyle) Styles["background-color"] = `${k?.trim()}${suffix}`;
		else if (k) Styles.color = `${k.trim()}${suffix}`;
	}
	return Styles;
}

function normalizeRuntimeLangs(value: unknown): unknown[] {
	const out: unknown[] = [];
	function push(v: unknown) {
		if (v == null) return;
		if (Array.isArray(v)) {
			for (const x of v) push(x);
			return;
		}
		out.push(v);
	}
	push(value);
	return out;
}

function getPrimaryRuntimeLangId(value: unknown): string | undefined {
	const first = normalizeRuntimeLangs(value)[0];
	if (first == null) return undefined;
	if (typeof first === "string") return first;
	if (typeof first === "object" && first !== null) {
		const o = first as Record<string, unknown>;
		const name = o.name;
		const scopeName = o.scopeName;
		if (typeof name === "string" && name.length > 0) return name;
		if (typeof scopeName === "string" && scopeName.length > 0) return scopeName;
		return "custom-lang";
	}
	return undefined;
}

function getRuntimeLangLabel(value: unknown): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		const o = value as Record<string, unknown>;
		if (typeof o.name === "string" && o.name.length > 0) return o.name;
		if (typeof o.scopeName === "string" && o.scopeName.length > 0)
			return o.scopeName;
		return "custom-lang";
	}
	return "unknown-lang";
}

function assertCompatibleHighlighter(
	highlighter: unknown,
	source: string,
	warnings = true,
	enabled = true,
): asserts highlighter is Highlighter {
	if (!enabled) return;
	if (!highlighter || typeof highlighter !== "object") {
		throw new Error(
			`${source} Incompatible highlighter. Use createHighlighter from shiki.`,
		);
	}
	const value = highlighter as Record<string, unknown>;
	for (const method of ["getLanguage", "getTheme", "setTheme"]) {
		if (typeof value[method] !== "function") {
			throw new Error(
				`${source} Incompatible highlighter. Missing method: ${method}.`,
			);
		}
	}
	if (
		(typeof value.loadLanguage !== "function" ||
			typeof value.loadTheme !== "function") &&
		warnings
	) {
		console.warn(
			`${source} Highlighter misses optional loadLanguage/loadTheme; dynamic loads may be partial.`,
		);
	}
}

const defaultShikiOptions = {
	lang: "text",
	warnings: true,
	versionGuard: true,
	themeStyle: "shiki" as const,
	defaultColor: "light" as const,
	cssVariablePrefix: "--shiki-",
	tokenizeMaxLineLength: 20000,
	includeExplanation: false,
	tokenizeTimeLimit: 500,
};

const themeCompartment = new Compartment();

type ThemeName = string;

class Base {
	protected themesCache = new Map<ThemeName, Extension>();
	protected currentTheme = "light";
	private readonly initShikiFn: InitShikiFn;

	get isCmStyle() {
		return this.configs.themeStyle === "cm";
	}

	constructor(
		protected shikiCore: Highlighter,
		protected configs: ShikiToCMOptions,
		initShikiFn?: InitShikiFn,
	) {
		this.initShikiFn = initShikiFn ?? (async () => this.shikiCore);
		this.loadThemes();
	}

	initTheme(): Extension {
		const { defaultColor, themes, warnings } = this.configs;
		if (defaultColor === false) return EditorView.baseTheme({});

		const hasColorKey = (key: string) => Boolean(themes?.[key]);
		const fallbackColor = hasColorKey("dark")
			? "dark"
			: hasColorKey("light")
				? "light"
				: Object.keys(themes || {})[0] || "light";

		let resolvedColor = fallbackColor;
		if (typeof defaultColor === "string" && hasColorKey(defaultColor)) {
			resolvedColor = defaultColor;
		} else if (typeof defaultColor === "string" && warnings) {
			console.warn(
				`[shiki-editor] defaultColor "${defaultColor}" is invalid; using "${fallbackColor}".`,
			);
		}
		this.currentTheme = resolvedColor;
		return this.getTheme(this.currentTheme);
	}

	async update(options: Partial<Options>, view: EditorView) {
		const prev = { ...this.configs };
		this.configs = { ...this.configs, ...options };

		const shouldReload =
			(options.themes !== undefined &&
				JSON.stringify(options.themes) !== JSON.stringify(prev.themes)) ||
			(options.defaultColor !== undefined &&
				prev.defaultColor !== options.defaultColor) ||
			(options.lang !== undefined && prev.lang !== options.lang) ||
			(options.langAlias !== undefined &&
				JSON.stringify(options.langAlias) !== JSON.stringify(prev.langAlias)) ||
			(options.highlighter !== undefined &&
				prev.highlighter !== options.highlighter) ||
			(options.warnings !== undefined && prev.warnings !== options.warnings);

		if (shouldReload) {
			this.shikiCore = await this.initShikiFn(this.configs);
			const raf =
				typeof globalThis !== "undefined" && globalThis.requestAnimationFrame
					? globalThis.requestAnimationFrame.bind(globalThis)
					: (fn: () => void) => setTimeout(fn, 0);
			raf(() => {
				this.loadThemes();
				view.dispatch({
					effects: themeCompartment.reconfigure(this.initTheme()),
				});
			});
		}
	}

	getTheme(name: string = this.currentTheme): Extension {
		const ext = this.themesCache.get(name);
		if (ext) {
			this.currentTheme = name;
			return ext;
		}
		throw new Error(`'${name}' theme is not registered!`);
	}

	loadThemes() {
		const { themes } = this.configs;
		for (const color of Object.keys(themes)) {
			const name = themes[color];
			if (!name) throw new Error(`'${String(name)}' theme is not registered!`);
			const getter = this.shikiCore.getTheme as (n: string) => {
				colors?: Record<string, string>;
				bg: string;
				fg: string;
				type: "light" | "dark";
			};
			const { colors, bg, fg, type } = getter.call(
				this.shikiCore,
				name as string,
			);
			let settings: ThemeSettings = { background: bg, foreground: fg };
			if (colors) {
				const defaultSelection = type === "dark" ? "#264f78" : "#add6ff";
				const selectionColor =
					colors["editor.selectionBackground"] ||
					colors["editor.wordHighlightBackground"] ||
					defaultSelection;
				settings = {
					...settings,
					gutterBackground: bg,
					gutterForeground: fg,
					gutterBorder: "transparent",
					selection: selectionColor,
					selectionMatch:
						colors["editor.wordHighlightStrongBackground"] ||
						colors["editor.selectionHighlightBackground"] ||
						selectionColor,
					caret:
						colors["editorCursor.foreground"] || colors.foreground || "#FFFFFF",
					lineHighlight:
						colors["editor.lineHighlightBackground"] ||
						(type === "dark" ? "#ffffff0a" : "#0000000a"),
				};
			}
			this.themesCache.set(
				color,
				createTheme({ theme: type, settings, classes: undefined }),
			);
		}
	}
}

const FONT_STYLE_MASK = 30720;
const FONT_STYLE_OFFSET = 11;
const FOREGROUND_MASK = 16744448;
const FOREGROUND_OFFSET = 15;

function getFontStyle(metadata: number): number {
	return (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET;
}

function getForeground(metadata: number): number {
	return (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET;
}

const CACHE_MAX_ENTRIES = 12000;
const CACHE_KEEP_BEHIND_LINES = 3000;
const CACHE_KEEP_AHEAD_LINES = 6000;
const CACHE_ANCHOR_INTERVAL = 200;

function computePrunableCacheLines(
	lines: number[],
	centerLine: number,
	options: {
		maxEntries?: number;
		keepBehindLines?: number;
		keepAheadLines?: number;
		anchorInterval?: number;
	} = {},
): number[] {
	const maxEntries = options.maxEntries ?? CACHE_MAX_ENTRIES;
	const keepBehindLines = options.keepBehindLines ?? CACHE_KEEP_BEHIND_LINES;
	const keepAheadLines = options.keepAheadLines ?? CACHE_KEEP_AHEAD_LINES;
	const anchorInterval = options.anchorInterval ?? CACHE_ANCHOR_INTERVAL;
	if (lines.length <= maxEntries) return [];
	const keepStart = Math.max(1, centerLine - keepBehindLines);
	const keepEnd = centerLine + keepAheadLines;
	const mustKeep: number[] = [];
	const removable: number[] = [];
	for (const line of lines) {
		const inWindow = line >= keepStart && line <= keepEnd;
		const isAnchor = line % anchorInterval === 0;
		if (inWindow || isAnchor) mustKeep.push(line);
		else removable.push(line);
	}
	if (mustKeep.length <= maxEntries) return removable;
	const over = mustKeep.length - maxEntries;
	const fallbackRemovals = [...mustKeep]
		.sort(
			(a, b) => Math.abs(b - centerLine) - Math.abs(a - centerLine) || b - a,
		)
		.slice(0, over);
	return removable.concat(fallbackRemovals);
}

class ShikiHighlighter extends Base {
	view!: EditorView;
	private grammarStateCache = new Map<number, unknown>();
	private internal: Highlighter;
	private isCoreUpdating = false;

	constructor(
		shikiCore: Highlighter,
		options: ShikiToCMOptions,
		initShikiFn?: InitShikiFn,
	) {
		super(shikiCore, options, initShikiFn);
		this.internal = shikiCore;
	}

	setView(view: EditorView) {
		this.view = view;
		return this;
	}

	override async update(options: Partial<Options>, view: EditorView) {
		this.grammarStateCache.clear();
		this.isCoreUpdating = true;
		try {
			await super.update(options, view);
			this.internal = this.shikiCore;
		} finally {
			this.isCoreUpdating = false;
		}
	}

	highlight(
		doc: Text,
		from: number,
		to: number,
		buildDeco: (from: number, to: number, mark: Decoration) => void,
		budgetOptions: { maxDecorations?: number } = {},
	): { produced: number; nextFrom: number | null } {
		let produced = 0;
		let nextFrom: number | null = null;
		const maxDecorations = budgetOptions.maxDecorations;
		if (this.isCoreUpdating) return { produced, nextFrom };
		if (!this.internal) {
			console.warn("highlight: internal not ready");
			return { produced, nextFrom };
		}
		const langId = getPrimaryRuntimeLangId(this.configs.lang);
		const themeAlias = this.currentTheme;
		const internal = this.internal;
		if (!langId) {
			if (this.configs.warnings)
				console.warn("highlight: lang is not configured");
			return { produced, nextFrom };
		}
		const validTheme = this.configs.themes[themeAlias];
		if (!validTheme) {
			console.warn(`highlight: theme '${themeAlias}' not in themes config`);
			return { produced, nextFrom };
		}
		const finalThemeName =
			typeof validTheme === "string"
				? validTheme
				: String((validTheme as { name?: string }).name);
		const setTheme = internal.setTheme as (n: string) => { colorMap: string[] };
		const { colorMap } = setTheme.call(internal, finalThemeName);
		let grammar: {
			tokenizeLine2: (
				line: string,
				state: unknown,
			) => { tokens: Uint32Array; ruleStack: unknown };
		};
		try {
			grammar = (internal.getLanguage as (id: string) => typeof grammar)(
				langId,
			);
		} catch (error) {
			if (this.configs.warnings) {
				console.warn(
					`highlight: lang '${langId}' not ready, skip frame`,
					error,
				);
			}
			return { produced, nextFrom };
		}
		if (!grammar) {
			if (this.configs.warnings)
				console.warn(`highlight: grammar not found for langId=${langId}`);
			return { produced, nextFrom };
		}
		const getTh = internal.getTheme as
			| undefined
			| ((n: string) => { fg?: string });
		const themeForeground =
			getTh?.call(internal, finalThemeName)?.fg ??
			(this.shikiCore.getTheme as (n: string) => { fg: string }).call(
				this.shikiCore,
				finalThemeName,
			).fg ??
			"#000";
		const defaultForeground = colorMap[1] || themeForeground;
		const startLine = doc.lineAt(from).number;
		const endLine = doc.lineAt(to).number;
		const stateLine = startLine - 1;
		let state: unknown;
		if (stateLine >= 1) {
			if (this.grammarStateCache.has(stateLine)) {
				state = this.grammarStateCache.get(stateLine);
			} else {
				let nearest = 0;
				for (let i = stateLine; i >= 1; i--) {
					if (this.grammarStateCache.has(i)) {
						nearest = i;
						state = this.grammarStateCache.get(i);
						break;
					}
				}
				if (nearest < stateLine) {
					let bridgeState = state;
					for (let i = nearest + 1; i <= stateLine; i++) {
						const lineContent = doc.line(i).text;
						const result = grammar.tokenizeLine2(lineContent, bridgeState);
						bridgeState = result.ruleStack;
						if (bridgeState !== undefined && bridgeState !== null) {
							this.grammarStateCache.set(i, bridgeState);
						}
					}
					state = bridgeState;
				}
			}
		}
		const cmClasses: Record<string, string> = {};
		const langLabel = getRuntimeLangLabel(this.configs.lang);
		this.view.dom.classList.toggle(
			`lang-${langLabel.replace(/[^\w-]/g, "_")}`,
			true,
		);
		let currentState = state;
		let lastProcessedLine = startLine - 1;
		for (let i = startLine; i <= endLine; i++) {
			if (maxDecorations !== undefined && produced >= maxDecorations) {
				nextFrom = doc.line(i).from;
				break;
			}
			const line = doc.line(i);
			const result = grammar.tokenizeLine2(line.text, currentState);
			currentState = result.ruleStack;
			if (currentState !== undefined && currentState !== null) {
				this.grammarStateCache.set(i, currentState);
			}
			const tokens = result.tokens;
			const len = tokens.length / 2;
			const pos = line.from;
			for (let j = 0; j < len; j++) {
				const startOffset = Number(tokens[2 * j]);
				const metadata = Number(tokens[2 * j + 1]);
				const endOffset =
					j + 1 < len ? Number(tokens[2 * (j + 1)]) : line.text.length;
				const foregroundId = getForeground(metadata);
				const fontStyle = getFontStyle(metadata);
				const color = colorMap[foregroundId] || defaultForeground;
				let style = `color:${color}`;
				if (fontStyle & 1) style += ";font-style:italic";
				if (fontStyle & 2) style += ";font-weight:bold";
				if (fontStyle & 4) style += ";text-decoration:underline";
				const cls = cmClasses[style] || newStyleModuleName();
				cmClasses[style] = cls;
				const tokenFrom = pos + startOffset;
				const tokenTo = pos + endOffset;
				if (tokenFrom < tokenTo) {
					const attributes: Record<string, string> = this.isCmStyle
						? { class: cls }
						: { style };
					buildDeco(
						tokenFrom,
						tokenTo,
						Decoration.mark({
							tagName: "span",
							attributes,
						}),
					);
					produced++;
				}
			}
			lastProcessedLine = i;
			if (maxDecorations !== undefined && produced >= maxDecorations) {
				if (i < endLine) nextFrom = doc.line(i + 1).from;
				break;
			}
		}
		const pruneCenterLine =
			lastProcessedLine >= startLine ? lastProcessedLine : startLine;
		for (const line of computePrunableCacheLines(
			[...this.grammarStateCache.keys()],
			pruneCenterLine,
		)) {
			this.grammarStateCache.delete(line);
		}
		if (this.isCmStyle) {
			for (const [k, v] of Object.entries(cmClasses)) {
				mountStyles(this.view, {
					[`& .cm-line .${v}`]: toStyleObject(k, false) || {},
				});
			}
		}
		return { produced, nextFrom };
	}
}

const updateEffect = StateEffect.define<Partial<Options>>();

interface DecorationEntry {
	from: number;
	to: number;
	mark: Decoration;
}

const RAPID_VIEWPORT_INTERVAL_MS = 48;
const RAPID_SCROLL_SETTLE_MS = 96;
const COARSE_HIGHLIGHT_LINE_BUDGET = 240;
const MAX_DECORATIONS_PER_CHUNK = 2500;

function normalizeVisibleRanges(
	ranges: readonly { from: number; to: number }[],
): { from: number; to: number }[] {
	const sorted = ranges
		.filter((r) => r.to > r.from)
		.map((r) => ({ from: r.from, to: r.to }))
		.sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: { from: number; to: number }[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (!last || range.from > last.to) merged.push(range);
		else if (range.to > last.to) last.to = range.to;
	}
	return merged;
}

function isSameRanges(
	a: { from: number; to: number }[],
	b: { from: number; to: number }[],
) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i]?.from !== b[i]?.from || a[i]?.to !== b[i]?.to) return false;
	}
	return true;
}

function sortDecorationEntries(entries: DecorationEntry[]): DecorationEntry[] {
	return entries
		.filter((e) => e.to > e.from)
		.sort((a, b) => a.from - b.from || a.to - b.to);
}

function buildDecorationsFromEntries(
	entries: DecorationEntry[],
	alreadySorted = false,
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const sorted = alreadySorted
		? entries.filter((e) => e.to > e.from)
		: sortDecorationEntries(entries);
	let warned = false;
	for (const entry of sorted) {
		try {
			builder.add(entry.from, entry.to, entry.mark);
		} catch (err) {
			if (!warned) {
				console.warn("[shiki-editor] skip invalid decoration range:", err);
				warned = true;
			}
		}
	}
	return builder.finish();
}

function shouldDeferViewportHighlight(
	now: number,
	lastViewportChangeAt: number,
	rapidIntervalMs = RAPID_VIEWPORT_INTERVAL_MS,
): boolean {
	return (
		lastViewportChangeAt > 0 && now - lastViewportChangeAt < rapidIntervalMs
	);
}

function trimRangesByLineBudget(
	doc: Text,
	ranges: { from: number; to: number }[],
	lineBudget = COARSE_HIGHLIGHT_LINE_BUDGET,
): { from: number; to: number }[] {
	if (lineBudget <= 0 || ranges.length === 0) return [];
	let remaining = lineBudget;
	const trimmed: { from: number; to: number }[] = [];
	for (const range of ranges) {
		if (remaining <= 0) break;
		const startLine = doc.lineAt(range.from).number;
		const endLine = doc.lineAt(range.to).number;
		const lineCount = endLine - startLine + 1;
		if (lineCount <= remaining) {
			trimmed.push(range);
			remaining -= lineCount;
			continue;
		}
		const capLineNumber = Math.max(startLine, startLine + remaining - 1);
		const capLine = doc.line(capLineNumber);
		const capTo = Math.min(range.to, capLine.to);
		if (capTo > range.from) trimmed.push({ from: range.from, to: capTo });
		remaining = 0;
	}
	if (trimmed.length === 0 && ranges[0]) {
		const firstLine = doc.lineAt(ranges[0].from);
		return [
			{
				from: ranges[0].from,
				to: Math.min(ranges[0].to, firstLine.to),
			},
		];
	}
	return trimmed;
}

const requestIdleCallback =
	typeof globalThis !== "undefined" && globalThis.requestIdleCallback
		? globalThis.requestIdleCallback.bind(globalThis)
		: (cb: () => void) => setTimeout(cb, 1);

const cancelIdleCallback =
	typeof globalThis !== "undefined" && globalThis.cancelIdleCallback
		? globalThis.cancelIdleCallback.bind(globalThis)
		: clearTimeout;

class ShikiView {
	decorations: DecorationSet = RangeSet.empty;
	lastPos = { from: 0, to: 0 };
	private pendingHighlight: ReturnType<typeof requestIdleCallback> | null =
		null;
	private pendingViewportSettle: ReturnType<typeof setTimeout> | null = null;
	private highlightRequestId = 0;
	private lastViewportChangeAt = 0;

	constructor(
		public shikiHighlighter: ShikiHighlighter,
		view: EditorView,
	) {
		this.updateHighlight(view);
	}

	destroy() {
		this.cancelPendingHighlight();
		this.cancelPendingViewportSettle();
		this.decorations = RangeSet.empty;
	}

	update(update: ViewUpdate) {
		let hasUpdateEffect = false;
		for (const tr of update.transactions) {
			for (const effect of tr.effects) {
				if (effect.is(updateEffect)) {
					hasUpdateEffect = true;
					const patch = effect.value as Partial<Options>;
					void this.shikiHighlighter
						.update(patch, update.view)
						.then(() => this.updateHighlight(update.view));
				}
			}
		}
		if (update.docChanged) {
			this.decorations = this.decorations.map(update.changes);
			if (!hasUpdateEffect) this.docChangeHighlight(update);
		} else if (update.viewportChanged) {
			this.handleViewportChanged(update.view);
		} else if (update.transactions.some((tr) => tr.reconfigured)) {
			this.updateHighlight(update.view);
		}
	}

	private cancelPendingHighlight() {
		if (this.pendingHighlight !== null) {
			cancelIdleCallback(this.pendingHighlight as number);
			this.pendingHighlight = null;
		}
	}

	private cancelPendingViewportSettle() {
		if (this.pendingViewportSettle !== null) {
			clearTimeout(this.pendingViewportSettle);
			this.pendingViewportSettle = null;
		}
	}

	private handleViewportChanged(view: EditorView) {
		const now = Date.now();
		const shouldDefer = shouldDeferViewportHighlight(
			now,
			this.lastViewportChangeAt,
		);
		this.lastViewportChangeAt = now;
		if (!shouldDefer) {
			this.cancelPendingViewportSettle();
			this.updateHighlight(view, { coarse: false });
			return;
		}
		this.cancelPendingViewportSettle();
		this.updateHighlight(view, { coarse: true });
		this.pendingViewportSettle = setTimeout(() => {
			this.pendingViewportSettle = null;
			this.updateHighlight(view, { coarse: false });
		}, RAPID_SCROLL_SETTLE_MS);
	}

	docChangeHighlight(update: ViewUpdate) {
		this.cancelPendingHighlight();
		this.cancelPendingViewportSettle();
		const requestId = ++this.highlightRequestId;
		const doc = update.view.state.doc;
		const ranges = normalizeVisibleRanges(update.view.visibleRanges);
		if (doc.length === 0 || ranges.length === 0) {
			this.decorations = RangeSet.empty;
			return;
		}
		const entries: DecorationEntry[] = [];
		for (const { from, to } of ranges) {
			this.shikiHighlighter.highlight(doc, from, to, (f, t, mark) => {
				entries.push({ from: f, to: t, mark });
			});
			this.lastPos = { from, to };
		}
		if (requestId !== this.highlightRequestId) return;
		this.decorations = buildDecorationsFromEntries(entries);
	}

	updateHighlight(
		view: EditorView,
		options: { coarse?: boolean; chunked?: boolean } = {},
	) {
		this.cancelPendingHighlight();
		const doc = view.state.doc;
		const normalizedVisibleRanges = normalizeVisibleRanges(view.visibleRanges);
		const newVisibleRanges = options.coarse
			? trimRangesByLineBudget(doc, normalizedVisibleRanges)
			: normalizedVisibleRanges;
		const useChunked = options.chunked !== false;
		const requestId = ++this.highlightRequestId;
		if (doc.length === 0 || newVisibleRanges.length === 0) {
			this.decorations = RangeSet.empty;
			return;
		}
		const requestedRanges = newVisibleRanges.map((r) => ({ ...r }));
		const pendingRanges = newVisibleRanges.slice();
		const entries: DecorationEntry[] = [];
		const runChunk = () => {
			if (requestId !== this.highlightRequestId) {
				this.pendingHighlight = null;
				return;
			}
			const currentRanges = normalizeVisibleRanges(view.visibleRanges);
			if (!isSameRanges(requestedRanges, currentRanges)) {
				this.pendingHighlight = null;
				return;
			}
			let remainingDecorations = useChunked
				? MAX_DECORATIONS_PER_CHUNK
				: Number.MAX_SAFE_INTEGER;
			try {
				while (pendingRanges.length > 0 && remainingDecorations > 0) {
					const current = pendingRanges.shift();
					if (current === undefined) break;
					const result = this.shikiHighlighter.highlight(
						doc,
						current.from,
						current.to,
						(f, t, mark) => {
							if (remainingDecorations <= 0) return;
							remainingDecorations--;
							entries.push({ from: f, to: t, mark });
						},
						{ maxDecorations: remainingDecorations },
					);
					if (result.nextFrom !== null && result.nextFrom < current.to) {
						pendingRanges.unshift({ from: result.nextFrom, to: current.to });
					}
					this.lastPos = { from: current.from, to: current.to };
				}
			} catch (error) {
				console.error("[shiki-editor] highlight failed:", error);
			}
			const snapshot = entries.slice();
			if (requestId !== this.highlightRequestId) return;
			this.decorations = buildDecorationsFromEntries(snapshot);
			this.pendingHighlight = null;
			view.dispatch({});
			if (
				useChunked &&
				pendingRanges.length > 0 &&
				requestId === this.highlightRequestId
			) {
				this.pendingHighlight = requestIdleCallback(runChunk);
			}
		};
		this.pendingHighlight = requestIdleCallback(runChunk);
	}
}

function shikiViewPlugin(
	shikiHighlighter: ShikiHighlighter,
	_options: ShikiToCMOptions,
) {
	return {
		viewPlugin: ViewPlugin.define(
			(view: EditorView) => new ShikiView(shikiHighlighter.setView(view), view),
			{ decorations: (v) => v.decorations },
		),
	};
}

async function shikiPlugin(
	highlighter: Highlighter,
	ctOptions: ShikiToCMOptions,
	initShikiFn?: InitShikiFn,
) {
	const shikiHighlighter = new ShikiHighlighter(
		highlighter,
		ctOptions,
		initShikiFn,
	);
	const { viewPlugin } = shikiViewPlugin(shikiHighlighter, ctOptions);
	const initialTheme = shikiHighlighter.initTheme();
	return {
		getTheme(name?: string, view?: EditorView) {
			if (view) shikiHighlighter.setView(view);
			return shikiHighlighter.getTheme(name);
		},
		shiki: [themeCompartment.of(initialTheme), viewPlugin],
	};
}

async function createShikiToCodeMirror(
	shikiOptions: Options,
	initShikiFn: InitShikiFn,
) {
	const normalizedOptions = { ...shikiOptions };
	const { theme, themes } = normalizedOptions as {
		theme?: string;
		themes?: ThemeRegistry;
	};
	if (!themes) {
		if (theme) {
			(normalizedOptions as { themes: ThemeRegistry }).themes = {
				light: theme,
			};
		} else {
			throw new Error(
				"[shiki-editor] Invalid options: provide `theme` or `themes`.",
			);
		}
	}
	if (themes && theme) {
		delete (normalizedOptions as { theme?: string }).theme;
	}
	const options = {
		...defaultShikiOptions,
		...normalizedOptions,
	} as ShikiToCMOptions;
	if (options.warnings) {
		if (theme && themes) {
			console.warn(
				"[shiki-editor] Both `theme` and `themes` provided; using `themes`.",
			);
		}
		if (
			typeof options.defaultColor === "string" &&
			options.themes &&
			!(options.defaultColor in options.themes)
		) {
			console.warn(
				`[shiki-editor] defaultColor "${options.defaultColor}" is not a key in themes.`,
			);
		}
	}
	const core = await initShikiFn(options);
	return shikiPlugin(core, options, initShikiFn);
}

function normalizeLangForShiki(lang: unknown): unknown {
	if (lang === "text") return "log";
	return lang;
}

function partitionOptions<TThemes extends ThemeRegistry>(
	options: ShikiEditorOptions<TThemes>,
) {
	const shikiKeys = [
		"lang",
		"langAlias",
		"theme",
		"themes",
		"themeStyle",
		"includeExplanation",
		"cssVariablePrefix",
		"colorReplacements",
		"warnings",
		"tokenizeMaxLineLength",
		"tokenizeTimeLimit",
		"defaultColor",
		"highlighter",
		"versionGuard",
		"resolveLang",
		"resolveTheme",
	] as const;
	const cmKeys = [
		"extensions",
		"parent",
		"state",
		"selection",
		"dispatch",
		"dispatchTransactions",
		"root",
		"scrollTo",
		"doc",
	] as const;
	function pick(keys: readonly string[]) {
		const o = options as unknown as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(o).filter(([k]) => keys.includes(k)),
		);
	}
	const rawShiki = pick(shikiKeys) as Options<TThemes>;
	rawShiki.lang = normalizeLangForShiki(rawShiki.lang);
	return {
		shikiOptions: rawShiki,
		cmOptions: pick(cmKeys) as Omit<
			ShikiEditorOptions<TThemes>,
			(typeof shikiKeys)[number] | "onUpdate"
		>,
	};
}

async function initPlaygroundHighlighter(
	options: Omit<ShikiToCMOptions, "theme">,
): Promise<Highlighter> {
	const themeNames = Object.values(options.themes)
		.map((t) =>
			typeof t === "string" ? t : String((t as { name?: string }).name),
		)
		.filter(Boolean) as string[];
	const highlighter = await createHighlighter({
		themes: themeNames,
		langs: ["ballerina", "toml", "log"],
	});
	assertCompatibleHighlighter(
		highlighter,
		"[shiki-editor]",
		options.warnings,
		options.versionGuard !== false,
	);
	return highlighter;
}

const shikiComp = new Compartment();

export class ShikiEditor<TThemes extends ThemeRegistry = ThemeRegistry> {
	view: EditorView;
	getTheme: Promise<(name?: string, view?: EditorView) => Extension>;

	constructor(options: ShikiEditorOptions<TThemes>) {
		const { shikiOptions, cmOptions } = partitionOptions(options);
		const userExtensions = cmOptions.extensions;
		const baseExtensions: Extension[] = [
			...(options.onUpdate
				? [EditorView.updateListener.of(options.onUpdate)]
				: []),
		];
		const cmExt = Array.isArray(userExtensions)
			? [...userExtensions, ...baseExtensions]
			: userExtensions
				? [userExtensions, ...baseExtensions]
				: baseExtensions;

		this.view = new EditorView({
			...cmOptions,
			extensions: [...cmExt, shikiComp.of([])],
		});

		this.getTheme = createShikiToCodeMirror(
			shikiOptions as Options<TThemes>,
			initPlaygroundHighlighter,
		).then(({ getTheme, shiki }) => {
			this.view.dispatch({
				effects: shikiComp.reconfigure(shiki),
			});
			return getTheme;
		});
	}

	update(partial: Partial<Pick<Options<TThemes>, "lang">>) {
		const mapped =
			partial.lang !== undefined
				? { ...partial, lang: normalizeLangForShiki(partial.lang) }
				: partial;
		this.view.dispatch({ effects: updateEffect.of(mapped) });
	}

	getValue(): string {
		return this.view.state.doc.toString();
	}

	setValue(doc: string) {
		this.view.dispatch({
			changes: { from: 0, to: this.view.state.doc.length, insert: doc },
		});
	}

	reconfigure(
		compartment: Compartment,
		extension: Extension | readonly Extension[],
	) {
		this.view.dispatch({
			effects: compartment.reconfigure(extension),
		});
	}

	destroy() {
		this.view.destroy();
	}
}
