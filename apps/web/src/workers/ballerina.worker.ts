/// <reference lib="webworker" />

import * as Comlink from "comlink";

import "@/wasm_exec";

import { createBallerinaWorkerApi } from "@/workers/ballerina-worker-runtime";

Comlink.expose(createBallerinaWorkerApi());
