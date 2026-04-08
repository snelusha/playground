import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	ChevronDown,
	ChevronUp,
	CleanIcon,
	GithubFreeIcons,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Progress } from "@/components/ui/progress";

import { AppSidebar } from "@/components/app-sidebar";
import { CodeEditor } from "@/components/code-editor";
import { VersionCard } from "@/components/version-card";
import { ANSI } from "@/components/ansi";

import {
	basename,
	dirname,
	ext,
	isRootPath,
	join,
} from "@/lib/fs/core/path-utils";
import { cn } from "@/lib/utils";

import { useEditorStore } from "@/stores/editor-store";
import { useActiveFile, useFileTreeActions } from "@/stores/file-tree-store";

import { useBallerina } from "@/hooks/use-ballerina";
import { useFS } from "@/providers/fs-provider";

import type { LayeredFS } from "@/lib/fs/layered-fs";
import type { EditorLanguage } from "@/components/code-editor";
import type { EditorDiagnostic } from "@/stores/editor-store";
import type { WasmDiagnostic } from "@/types/wasm-types";

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

function getBallerinaExecutionTarget(fs: LayeredFS, path: string): string {
	let currentDir = dirname(path);
	const hasRootPrefix = path.startsWith("/");

	while (!isRootPath(currentDir)) {
		const dirPath =
			hasRootPrefix && !currentDir.startsWith("/")
				? `/${currentDir}`
				: currentDir;
		const tomlPath = join(dirPath, "Ballerina.toml");
		if (fs.stat(tomlPath)) return dirPath;
		currentDir = dirname(currentDir);
	}

	return path;
}

function toEditorDiagnostic(
	diagnostic: WasmDiagnostic,
): EditorDiagnostic | null {
	if (
		typeof diagnostic.startLine !== "number" ||
		typeof diagnostic.startCol !== "number" ||
		typeof diagnostic.endLine !== "number" ||
		typeof diagnostic.endCol !== "number"
	) {
		return null;
	}

	const severity = mapSeverity(diagnostic.severity);
	return {
		severity,
		code: diagnostic.code,
		message: diagnostic.message,
		startLine: diagnostic.startLine,
		startCol: diagnostic.startCol,
		endLine: diagnostic.endLine,
		endCol: diagnostic.endCol,
	};
}

function mapSeverity(value: string): EditorDiagnostic["severity"] {
	if (value === "warning") return "warning";
	if (value === "info") return "info";
	return "error";
}

function resolveDiagnosticPath(
	target: string,
	filePath?: string,
): string | null {
	if (!filePath) return null;
	if (filePath.startsWith("/")) return filePath;
	if (ext(target) === "bal") return target;
	return join(target, filePath);
}

function OutputPane() {
	const output = useEditorStore((s) => s.output);
	const outputOpen = useEditorStore((s) => s.outputOpen);
	const toggleOutputOpen = useEditorStore((s) => s.toggleOutputOpen);
	const clearOutput = useEditorStore((s) => s.clearOutput);

	return (
		<div
			className={cn(
				"flex flex-col min-h-0 min-w-0",
				"lg:w-1/2 lg:flex-none",
				outputOpen ? "flex-1 lg:flex" : "shrink-0 lg:flex",
			)}
		>
			<div className="flex h-10 shrink-0 items-center justify-between border-b border-t lg:border-t-0">
				<div className="flex items-center h-full">
					<span className="px-4 h-full text-xs text-muted-foreground flex items-center">
						Output
					</span>
				</div>
				<div className="flex items-center h-full">
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
				className={cn(
					"min-h-0 overflow-y-auto p-4",
					outputOpen ? "flex-1" : "hidden lg:block lg:flex-1",
				)}
			>
				<pre className="text-[13px] font-sans whitespace-pre-wrap wrap-break-word">
					<ANSI value={output} />
				</pre>
			</div>
		</div>
	);
}

function EditorPane({ onRun }: { onRun: () => void }) {
	const activeFile = useActiveFile();

	const { updateFileContent } = useFileTreeActions();

	const outputOpen = useEditorStore((s) => s.outputOpen);
	const toggleEditorMode = useEditorStore((s) => s.toggleEditorMode);
	const diagnosticsByPath = useEditorStore((s) => s.diagnosticsByPath);

	const activeDiagnostics = React.useMemo(
		() => (activeFile ? (diagnosticsByPath[activeFile.path] ?? []) : []),
		[activeFile, diagnosticsByPath],
	);

	const handleChange = React.useCallback(
		(next: string) => {
			if (!activeFile) return;
			updateFileContent(next);
		},
		[activeFile, updateFileContent],
	);
	return (
		<div
			className={cn(
				"flex flex-col lg:border-b-0 lg:border-r min-h-0",
				"lg:w-1/2 lg:flex-none lg:h-full",
				outputOpen ? "h-1/2" : "flex-1",
			)}
		>
			<div className="flex h-10 shrink-0 items-center justify-between border-b">
				<span className="px-4 h-full text-xs border-r flex items-center truncate max-w-[60%]">
					{activeFile ? basename(activeFile.path) : "No file selected"}
				</span>
				<Button
					className="h-full rounded-none"
					variant="ghost"
					onClick={onRun}
					disabled={!activeFile || getLanguage(activeFile.path) !== "ballerina"}
				>
					<HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} />
					<span>Run</span>
				</Button>
			</div>
			{activeFile && (
				<CodeEditor
					key={activeFile.path}
					value={activeFile?.content}
					onChange={handleChange}
					diagnostics={
						getLanguage(activeFile.path) === "ballerina"
							? activeDiagnostics
							: []
					}
					hotkeys={{
						"Mod-Enter": onRun,
						"Mod-Alt-v": toggleEditorMode,
						"Mod-r": () => window.location.reload(),
					}}
					language={activeFile ? getLanguage(activeFile.path) : "text"}
				/>
			)}
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
			</div>
		</header>
	);
}

function EditorContent() {
	const fs = useFS();

	const { isReady, progress, run } = useBallerina();

	const activeFile = useActiveFile();

	const { saveFile } = useFileTreeActions();

	const openOutputWith = useEditorStore((s) => s.openOutputWith);
	const setDiagnosticsForPath = useEditorStore((s) => s.setDiagnosticsForPath);
	const clearAllDiagnostics = useEditorStore((s) => s.clearAllDiagnostics);
	const toggleEditorMode = useEditorStore((s) => s.toggleEditorMode);

	const handleRun = React.useCallback(() => {
		if (!activeFile || getLanguage(activeFile.path) !== "ballerina") return;

		const oldConsole = console.log;
		let captured = "";

		console.log = (...args) => {
			captured += `${args.join(" ")}\n`;
			oldConsole.apply(console, args);
		};

		try {
			// FIXME: We should automatically save files on change.
			saveFile();

			const target = getBallerinaExecutionTarget(fs, activeFile.path);
			const runResult = run(target);
			clearAllDiagnostics();
			if (runResult && "error" in runResult && runResult.error) {
				captured += `${runResult.error}\n`;
			}
			if (runResult && "diagnostics" in runResult) {
				const grouped = new Map<string, EditorDiagnostic[]>();
				for (const diagnostic of runResult.diagnostics) {
					const normalized = toEditorDiagnostic(diagnostic);
					if (!normalized) continue;
					const filePath =
						resolveDiagnosticPath(target, diagnostic.filePath) ??
						activeFile.path;
					const current = grouped.get(filePath) ?? [];
					current.push(normalized);
					grouped.set(filePath, current);
				}
				for (const [filePath, diagnostics] of grouped) {
					setDiagnosticsForPath(filePath, diagnostics);
				}
			}
		} finally {
			console.log = oldConsole;
		}

		openOutputWith(captured);
	}, [
		activeFile,
		fs,
		saveFile,
		run,
		openOutputWith,
		clearAllDiagnostics,
		setDiagnosticsForPath,
	]);

	useHotkeys("mod+enter", () => handleRun(), {
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
					<EditorPane onRun={handleRun} />
					<OutputPane />
				</main>
			</SidebarInset>
		</>
	);
}

function WasmLoadingScreen({ progress }: { progress: number }) {
	const pct = Math.max(0, Math.min(100, progress));
	return (
		<div className="w-full flex items-center justify-center min-h-dvh">
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
