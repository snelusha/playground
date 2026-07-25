import { beforeAll, expect, test } from "bun:test";

import { createFs } from "./test-fs";
import { SnapshotFS } from "../src/lib/fs/snapshot";
import "../src/wasm_exec";

import type { RunEvent } from "../src/workers/ballerina-worker-api";

interface TestCase {
	name: string;
	files: () => Promise<Map<string, string>>;
	entryPoint: string;
	expectedStdout?: string;
	expectedStderr?: string;
	stopAfterOutput?: boolean;
}

async function load(path: string) {
	return await Bun.file(new URL(path, import.meta.url)).text();
}

async function runBallerina(
	files: Map<string, string>,
	entryPoint: string,
	stopAfterOutput = false,
): Promise<{ stdout: string; stderr: string }> {
	const fs = await SnapshotFS.from(createFs(files), entryPoint);
	const output = { stdout: "", stderr: "" };
	let stopSent = false;
	const onEvent = (event: RunEvent) => {
		if (event.type !== "output") return;
		output[event.stream] += event.text;
		if (stopAfterOutput && !stopSent && output.stdout.length > 0) {
			stopSent = true;
			void globalThis.sendStopSignal();
		}
	};

	await globalThis.run(fs, entryPoint, onEvent);
	return output;
}

beforeAll(async () => {
	const go = new globalThis.Go();
	const { instance } = await WebAssembly.instantiateStreaming(
		fetch(new URL("../public/ballerina.wasm", import.meta.url).href),
		go.importObject,
	);
	go.run(instance);
});

const testCases: TestCase[] = [
	{
		name: "hello world",
		files: async () =>
			new Map([["/tmp/main.bal", await load("./fixtures/hello-world.bal")]]),
		entryPoint: "/tmp/main.bal",
		expectedStdout: "Hello, World!\n",
	},

	{
		name: "hello world (package)",
		files: async () =>
			new Map([
				[
					"/tmp/hello-world/main.bal",
					await load("./fixtures/hello-world/main.bal"),
				],
				[
					"/tmp/hello-world/Ballerina.toml",
					await load("./fixtures/hello-world/Ballerina.toml"),
				],
			]),
		entryPoint: "/tmp/hello-world",
		expectedStdout: "Hello, World!\n",
	},
	{
		name: "file read/write",
		files: async () =>
			new Map([
				["/tmp/main.bal", await load("./fixtures/file-read-write.bal")],
			]),
		entryPoint: "/tmp/main.bal",
		expectedStdout:
			"true\ntrue\ntrue\ntrue\n<book><title>Clean Code</title></book>\ntrue\n",
	},
	{
		name: "os env",
		files: async () =>
			new Map([["/tmp/main.bal", await load("./fixtures/os-env.bal")]]),
		entryPoint: "/tmp/main.bal",
		expectedStdout: "true\ntrue\ntrue\ntrue\ntrue\n",
	},
	{
		name: "runtime sleep",
		files: async () =>
			new Map([["/tmp/main.bal", await load("./fixtures/runtime-sleep.bal")]]),
		entryPoint: "/tmp/main.bal",
		expectedStdout: "before\nafter\ndone\n",
	},
	{
		name: "file API",
		files: async () =>
			new Map([["/local/main.bal", await load("./fixtures/file-api.bal")]]),
		entryPoint: "/local/main.bal",
		expectedStdout: "true\n1\ntrue\ntrue\nfalse\ntrue\nfalse\n",
	},
	{
		name: "file watch",
		files: async () =>
			new Map([["/local/main.bal", await load("./fixtures/file-watch.bal")]]),
		entryPoint: "/local/main.bal",
		expectedStdout: "true\n",
		stopAfterOutput: true,
	},
];

for (const tc of testCases) {
	test(tc.name, async () => {
		const files = await tc.files();
		const result = await runBallerina(files, tc.entryPoint, tc.stopAfterOutput);
		expect(result.stdout).toBe(tc.expectedStdout ?? "");
		expect(result.stderr).toBe(tc.expectedStderr ?? "");
	});
}

test("file watch receives external editor mutations", async () => {
	const snapshot = await SnapshotFS.from(
		createFs(
			new Map([
				["/local/main.bal", await load("./fixtures/file-watch-external.bal")],
			]),
		),
		"/local/main.bal",
	);
	await snapshot.mkdirAll("/tmp/watch-external");

	const output = { stdout: "", stderr: "" };
	let editorMutationApplied = false;
	await globalThis.run(snapshot, "/local/main.bal", async (event: RunEvent) => {
		if (event.type !== "output") return;
		output[event.stream] += event.text;
		if (!editorMutationApplied && output.stdout.includes("ready\n")) {
			editorMutationApplied = true;
			const events = await snapshot.applyExternalMutation({
				type: "writeFile",
				path: "/tmp/watch-external/editor.txt",
				content: "from editor",
			});
			globalThis.notifyFilesystemEvents(events);
		}
		if (output.stdout.includes("true\n")) void globalThis.sendStopSignal();
	});

	expect(output.stdout).toBe("ready\ntrue\n");
	expect(output.stderr).toBe("");
});

test("snapshot reports move and remove mutations", async () => {
	const snapshot = await SnapshotFS.from(
		createFs(new Map([["/tmp/source.txt", "content"]])),
		"/tmp/source.txt",
	);
	const mutations: string[] = [];
	snapshot.onMutation((mutation) => mutations.push(mutation.type));

	expect(await snapshot.move("/tmp/source.txt", "/tmp/destination.txt")).toBe(
		true,
	);
	expect(await snapshot.remove("/tmp/destination.txt")).toBe(true);
	expect(mutations).toEqual(["move", "remove"]);
});
