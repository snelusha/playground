import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
	base: "/playground/",
	plugins: [react(), tailwindcss(), nodePolyfills()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
