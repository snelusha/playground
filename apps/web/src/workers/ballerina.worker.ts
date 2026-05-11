/// <reference lib="webworker" />

import "@/wasm_exec";

import type {
	BallerinaWorkerRequest,
	BallerinaWorkerResponse,
} from "@/lib/ballerina/protocol";
import {
	ensureBallerinaWasmBoot,
	handleWorkerMessageEvent,
} from "@/lib/ballerina/worker-backend";

declare const self: DedicatedWorkerGlobalScope;

const postToMain = (msg: BallerinaWorkerResponse) => {
	self.postMessage(msg);
};

const ensureWasm = () =>
	ensureBallerinaWasmBoot(postToMain, self.location.origin);

self.onmessage = (ev: MessageEvent<BallerinaWorkerRequest>) => {
	void handleWorkerMessageEvent(ev, postToMain, ensureWasm);
};

void ensureWasm().catch(() => {
	/* `bootError` already posted */
});
