import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	ChevronDown,
	ChevronUp,
	CleanIcon,
	GithubFreeIcons,
	PlayIcon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { AppSidebar } from "@/components/app-sidebar";
import { CodeEditor } from "@/components/code-editor";
import { VersionCard } from "@/components/version-card";
import { SettingsDialog } from "@/components/settings-dialog";
import { ANSI } from "@/components/ansi";

import { basename, ext } from "@/lib/fs/core/path-utils";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";
import { cn } from "@/lib/utils";

import { useEditorStore } from "@/stores/editor-store";
import { useActiveFile, useFileTreeActions } from "@/stores/file-tree-store";

import { useBallerina } from "@/hooks/use-ballerina";
import { useFS } from "@/providers/fs-provider";

import type { EditorLanguage } from "@/components/code-editor";
import type {
	HttpMethod,
	HttpServiceResponse,
	RuntimeSignal,
} from "@/workers/ballerina-worker-api";

function getLanguage(path: string): EditorLanguage {
	const ex = ext(path);
	switch (ex) {
		case "bal":
			return "ballerina";
		case "toml":
			return "toml";
		default:
			return "text";
	}
}

function findJsonFragmentEnd(text: string, start: number): number | null {
	const stack: string[] = [];
	let inString = false;
	let escaped = false;

	for (let index = start; index < text.length; index += 1) {
		const char = text[index];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === "{" || char === "[") {
			stack.push(char === "{" ? "}" : "]");
			continue;
		}

		if (char === "}" || char === "]") {
			if (stack.pop() !== char) return null;
			if (stack.length === 0) return index + 1;
		}
	}

	return null;
}

function normalizeJsonValue(value: unknown): unknown {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				return normalizeJsonValue(JSON.parse(trimmed));
			} catch {
				return value;
			}
		}

		return value;
	}

	if (Array.isArray(value)) return value.map(normalizeJsonValue);

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				normalizeJsonValue(entry),
			]),
		);
	}

	return value;
}

function stringifyPrettyJson(value: unknown): string {
	return JSON.stringify(normalizeJsonValue(value), null, 2);
}

function formatJsonOutput(output: string): string {
	const trimmed = output.trim();
	if (!trimmed) return output;

	try {
		const parsed: unknown = JSON.parse(trimmed);
		return stringifyPrettyJson(parsed);
	} catch {
		let formatted = "";
		let cursor = 0;

		while (cursor < output.length) {
			const char = output[cursor];

			if (char !== "{" && char !== "[") {
				formatted += char;
				cursor += 1;
				continue;
			}

			const end = findJsonFragmentEnd(output, cursor);
			if (end === null) {
				formatted += char;
				cursor += 1;
				continue;
			}

			const fragment = output.slice(cursor, end);
			try {
				const parsed: unknown = JSON.parse(fragment);
				formatted += stringifyPrettyJson(parsed);
				cursor = end;
			} catch {
				formatted += char;
				cursor += 1;
			}
		}

		return formatted;
	}
}

function OutputPane({
	onInvokeHttpService,
	variant = "split",
}: {
	onInvokeHttpService: (
		method: HttpMethod,
		path: string,
		port: number,
	) => Promise<HttpServiceResponse>;
	variant?: "split" | "tab";
}) {
	const output = useEditorStore((s) => s.output);
	const formattedOutput = React.useMemo(
		() => formatJsonOutput(output),
		[output],
	);
	const outputOpen = useEditorStore((s) => s.outputOpen);
	const toggleOutputOpen = useEditorStore((s) => s.toggleOutputOpen);
	const clearOutput = useEditorStore((s) => s.clearOutput);
	const appendOutput = useEditorStore((s) => s.appendOutput);
	const [httpMethod, setHttpMethod] = React.useState<HttpMethod>("GET");
	const [httpPath, setHttpPath] = React.useState("/");
	const [httpPort, setHttpPort] = React.useState("9090");
	const [isInvoking, setIsInvoking] = React.useState(false);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = React.useRef(true);
	const previousOutputLengthRef = React.useRef(output.length);
	const previousOutputOpenRef = React.useRef(outputOpen);

	const updateAutoScrollState = React.useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const distanceFromBottom =
			element.scrollHeight - element.scrollTop - element.clientHeight;
		shouldAutoScrollRef.current = distanceFromBottom < 24;
	}, []);

	const handleInvokeHTTP = React.useCallback(async () => {
		if (isInvoking) return;
		setIsInvoking(true);
		try {
			const port = Number.parseInt(httpPort, 10) || 0;
			const response = await onInvokeHttpService(httpMethod, httpPath, port);
			appendOutput(
				`\n> ${httpMethod} :${port || "?"}${httpPath || "/"}\n< ${response.status}\n${response.body}\n`,
			);
		} catch (error) {
			appendOutput(`\nHTTP invoke failed: ${String(error)}\n`);
		} finally {
			setIsInvoking(false);
		}
	}, [
		appendOutput,
		httpMethod,
		httpPath,
		httpPort,
		isInvoking,
		onInvokeHttpService,
	]);

	React.useLayoutEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		const outputWasReset = output.length < previousOutputLengthRef.current;
		const outputWasOpened = outputOpen && !previousOutputOpenRef.current;

		previousOutputLengthRef.current = output.length;
		previousOutputOpenRef.current = outputOpen;

		if (outputWasReset || outputWasOpened) {
			shouldAutoScrollRef.current = true;
		}

		if (shouldAutoScrollRef.current || outputOpen) {
			element.scrollTo({
				top: element.scrollHeight,
				behavior: outputWasReset ? "auto" : "smooth",
			});
		}
	}, [output, outputOpen]);

	return (
		<div
			className={cn(
				"flex flex-col min-h-0 min-w-0",
				variant === "split" && "hidden lg:flex lg:w-1/2 lg:flex-none",
				variant === "tab" && "flex-1",
			)}
		>
			<div className="flex h-10 shrink-0 items-center justify-between border-b border-t lg:border-t-0">
				<div className="flex items-center h-full min-w-0 flex-1">
					{variant === "split" && (
						<span className="px-4 h-full text-xs text-muted-foreground flex items-center shrink-0">
							Output
						</span>
					)}
					<div className="flex items-center h-full min-w-0 flex-1 border-l">
						<select
							className="h-full bg-transparent px-2 text-xs outline-none border-r"
							value={httpMethod}
							onChange={(event) =>
								setHttpMethod(event.target.value as HttpMethod)
							}
							aria-label="HTTP method"
						>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
							<option value="PUT">PUT</option>
							<option value="PATCH">PATCH</option>
							<option value="DELETE">DELETE</option>
						</select>
						<Input
							className="h-full w-20 rounded-none border-0 border-r text-xs shadow-none focus-visible:ring-0"
							value={httpPort}
							onChange={(event) => setHttpPort(event.target.value)}
							placeholder="port"
							inputMode="numeric"
							aria-label="HTTP service port"
						/>
						<Input
							className="h-full min-w-0 rounded-none border-0 text-xs shadow-none focus-visible:ring-0"
							value={httpPath}
							onChange={(event) => setHttpPath(event.target.value)}
							placeholder="/path"
							aria-label="HTTP endpoint path"
						/>
						<Button
							className="h-full rounded-none border-l"
							variant="ghost"
							onClick={() => void handleInvokeHTTP()}
							disabled={isInvoking}
						>
							{isInvoking ? "Sending..." : "Send"}
						</Button>
					</div>
				</div>
				<div className="flex items-center h-full shrink-0">
					{variant === "split" && (
						<Button
							className="h-full border-l lg:hidden"
							variant="ghost"
							onClick={toggleOutputOpen}
						>
							<HugeiconsIcon
								icon={outputOpen ? ChevronDown : ChevronUp}
								strokeWidth={1.5}
							/>
							<span className="text-xs">
								{outputOpen ? "Minimize" : "Show Output"}
							</span>
						</Button>
					)}
					<Button
						className="h-full border-l"
						variant="ghost"
						onClick={clearOutput}
					>
						<HugeiconsIcon icon={CleanIcon} strokeWidth={1.5} />
						<span className="hidden sm:inline">Clear</span>
					</Button>
				</div>
			</div>
			<div
				ref={scrollRef}
				data-testid={variant === "split" ? "output-pane" : "mobile-output-pane"}
				onScroll={updateAutoScrollState}
				className={cn(
					"min-h-0 overflow-y-auto p-4",
					variant === "tab" ? "flex-1" : "lg:block lg:flex-1",
				)}
			>
				<pre className="text-[13px] font-sans whitespace-pre-wrap wrap-break-word">
					<ANSI value={formattedOutput} />
				</pre>
			</div>
		</div>
	);
}

function EditorPane({
	onRun,
	isRunning,
	onStop,
	onInvokeHttpService,
}: {
	onRun: () => Promise<void>;
	isRunning: boolean;
	onStop: (signal: RuntimeSignal) => Promise<void>;
	onInvokeHttpService: (
		method: HttpMethod,
		path: string,
		port: number,
	) => Promise<HttpServiceResponse>;
}) {
	const activeFile = useActiveFile();

	const { updateFileContent } = useFileTreeActions();

	const outputOpen = useEditorStore((s) => s.outputOpen);
	const toggleEditorMode = useEditorStore((s) => s.toggleEditorMode);
	const [activeTab, setActiveTab] = React.useState("editor");

	const handleChange = React.useCallback(
		(next: string) => {
			if (!activeFile) return;
			updateFileContent(next);
		},
		[activeFile, updateFileContent],
	);
	React.useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 1023px)");
		const syncForViewport = () => {
			if (!mediaQuery.matches) {
				setActiveTab("editor");
			}
		};

		syncForViewport();
		mediaQuery.addEventListener("change", syncForViewport);
		return () => mediaQuery.removeEventListener("change", syncForViewport);
	}, []);

	React.useEffect(() => {
		if (outputOpen && window.matchMedia("(max-width: 1023px)").matches) {
			setActiveTab("output");
		}
	}, [outputOpen]);

	const showOutputTabOnMobile = React.useCallback(() => {
		if (window.matchMedia("(max-width: 1023px)").matches) {
			setActiveTab("output");
		}
	}, []);

	const handleRunFromEditor = React.useCallback(async () => {
		showOutputTabOnMobile();
		await onRun();
	}, [onRun, showOutputTabOnMobile]);

	return (
		<div className="flex flex-1 flex-col min-h-0 lg:border-b-0 lg:border-r lg:w-1/2 lg:flex-none lg:h-full">
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 min-h-0 gap-0"
			>
				<div className="flex h-10 shrink-0 items-center justify-between border-b">
					<TabsList className="h-full! p-0!">
						<TabsTrigger
							value="editor"
							className="bg-background! text-xs truncate px-4 h-full! border-r! border-0 border-border!"
						>
							{activeFile ? basename(activeFile.path) : "No file selected"}
						</TabsTrigger>
						<TabsTrigger
							value="output"
							className="bg-background! text-xs truncate px-4 h-full! border-r! border-0 border-border! lg:hidden"
						>
							Output
						</TabsTrigger>
					</TabsList>
					<ButtonGroup className="h-full">
						<Button
							className="h-full"
							variant="ghost"
							data-testid="run-button"
							onClick={
								isRunning
									? () => void onStop("graceful")
									: () => void handleRunFromEditor()
							}
							disabled={
								!isRunning &&
								(!activeFile || getLanguage(activeFile.path) !== "ballerina")
							}
						>
							{!isRunning ? (
								<>
									<HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} />
									<span className="min-w-7.5">Run</span>
								</>
							) : (
								<>
									<HugeiconsIcon icon={StopIcon} strokeWidth={1.5} />
									<span className="min-w-7.5">Stop</span>
								</>
							)}
						</Button>
						<Separator orientation="vertical" />
						<DropdownMenu disabled={!isRunning}>
							<DropdownMenuTrigger
								render={
									<Button
										className="h-full"
										variant="ghost"
										aria-label="Stop options"
										data-testid="stop-options-button"
									>
										<HugeiconsIcon icon={ChevronDown} strokeWidth={1.5} />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => onStop("graceful")}>
									Graceful Stop (Default)
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onStop("immediate")}>
									Immediate Stop
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</ButtonGroup>
				</div>

				<TabsContent value="editor" className="flex-1 min-h-0">
					{activeFile && (
						<CodeEditor
							key={activeFile.path}
							filePath={activeFile.path}
							value={activeFile?.content}
							onChange={handleChange}
							hotkeys={{
								"Mod-Enter": () => void handleRunFromEditor(),
								"Mod-Alt-v": toggleEditorMode,
								"Mod-r": () => window.location.reload(),
							}}
							language={activeFile ? getLanguage(activeFile.path) : "text"}
						/>
					)}
				</TabsContent>
				<TabsContent value="output" className="flex-1 min-h-0 lg:hidden">
					<OutputPane onInvokeHttpService={onInvokeHttpService} variant="tab" />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function EditorHeader() {
	return (
		<header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
			<div className="flex items-center gap-4">
				<SidebarTrigger className="-ml-1" />
				<h1 className="text-sm font-medium">Ballerina Playground</h1>
			</div>
			<div className="flex items-center gap-4">
				<VersionCard />
				<a
					className="flex items-center gap-2 text-xs text-muted-foreground hover:text-secondary-foreground"
					href="https://github.com/ballerina-platform/playground"
					target="_blank"
					rel="noopener noreferrer"
				>
					<HugeiconsIcon icon={GithubFreeIcons} strokeWidth={1.5} size={16} />
					<span className="sm:block hidden">GitHub</span>
				</a>
				<SettingsDialog />
			</div>
		</header>
	);
}

function EditorContent() {
	const fs = useFS();

	const { isReady, progress, run, sendStopSignal, invokeHttpService } =
		useBallerina();

	const activeFile = useActiveFile();

	const { saveFile } = useFileTreeActions();
	const [isRunning, setIsRunning] = React.useState(false);

	const openOutputWith = useEditorStore((s) => s.openOutputWith);
	const appendOutput = useEditorStore((s) => s.appendOutput);
	const toggleEditorMode = useEditorStore((s) => s.toggleEditorMode);

	const handleRun = React.useCallback(async () => {
		if (isRunning) return;
		if (!activeFile || getLanguage(activeFile.path) !== "ballerina") return;

		setIsRunning(true);
		try {
			// FIXME: We should automatically save files on change.
			await saveFile();

			const target = await getBallerinaProjectTarget(fs, activeFile.path);
			openOutputWith("");
			await run(target, ({ text }) => appendOutput(text));
		} finally {
			setIsRunning(false);
		}
	}, [activeFile, fs, saveFile, run, openOutputWith, appendOutput, isRunning]);

	const handleStop = React.useCallback(
		async (signal: RuntimeSignal) => {
			await sendStopSignal(signal);
		},
		[sendStopSignal],
	);

	useHotkeys("mod+enter", () => void handleRun(), {
		preventDefault: true,
	});

	useHotkeys("mod+alt+v", () => toggleEditorMode(), {
		preventDefault: true,
	});

	if (!isReady) return <WasmLoadingScreen progress={progress} />;

	return (
		<>
			<AppSidebar />
			<SidebarInset className="flex flex-col h-dvh overflow-hidden">
				<EditorHeader />
				<main className="flex flex-col lg:flex-row flex-1 min-h-0">
					<EditorPane
						onRun={handleRun}
						isRunning={isRunning}
						onStop={handleStop}
						onInvokeHttpService={invokeHttpService}
					/>
					<OutputPane onInvokeHttpService={invokeHttpService} />
				</main>
			</SidebarInset>
		</>
	);
}

function WasmLoadingScreen({ progress }: { progress: number }) {
	const pct = Math.max(0, Math.min(100, progress));
	return (
		<div
			className="w-full flex items-center justify-center min-h-dvh"
			data-testid="wasm-loading"
		>
			<div className="flex flex-col items-center gap-4">
				<div className="text-sm text-muted-foreground">
					Loading WASM binaries...&nbsp;
					<span className="inline-block text-right w-10 tabular-nums">
						{pct}%
					</span>
				</div>
				<Progress className="w-full" value={progress} />
			</div>
		</div>
	);
}

export function Editor() {
	return (
		<SidebarProvider>
			<EditorContent />
		</SidebarProvider>
	);
}
