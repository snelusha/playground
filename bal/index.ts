import { init } from "./wasm";

export async function main() {
	await init();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
