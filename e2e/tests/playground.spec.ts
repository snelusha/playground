import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "@playwright/test";

async function loadFixture(name: string) {
	return readFile(join(process.cwd(), "e2e", "fixtures", name), "utf8");
}

async function openPlayground(page: Page, path = "/") {
	await page.goto(path);
	await expect(page.getByTestId("wasm-loading")).toBeHidden({
		timeout: 90_000,
	});
}

async function runAndExpectOutput(page: Page, expectedOutput: string) {
	const runButton = page.getByTestId("run-button");
	await expect(runButton).toBeEnabled({ timeout: 10_000 });

	await runButton.click();
	await expect(runButton).toContainText("Run", { timeout: 10_000 });

	await expect(page.getByTestId("output-pane")).toHaveText(expectedOutput, {
		timeout: 10_000,
	});
}

async function createPackage(page: Page, packageName: string) {
	await page.getByTestId("localspace-add").click();
	await page.getByRole("menuitem", { name: "New Package" }).click();

	const dialog = page.getByTestId("file-tree-dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Name").fill(packageName);
	await dialog.getByRole("button", { name: "Create" }).click();
	await expect(dialog).toBeHidden();

	await expect(page.getByText(packageName)).toBeVisible();
}

async function replaceEditorContent(page: Page, content: string) {
	const editor = page.getByTestId("code-editor").locator(".cm-content");
	await editor.click();
	await page.keyboard.press(
		process.platform === "darwin" ? "Meta+A" : "Control+A",
	);
	await page.keyboard.insertText(content);
}

test("creates a package and runs hello world", async ({ page }) => {
	test.setTimeout(120_000);

	const helloWorldCode = await loadFixture("hello-world.bal");
	const packageName = `e2e_pkg_${Date.now()}`;

	await openPlayground(page);

	const runButton = page.getByTestId("run-button");
	await expect(runButton).toBeEnabled({ timeout: 10_000 });

	await createPackage(page, packageName);
	await replaceEditorContent(page, helloWorldCode);

	await runAndExpectOutput(page, "Hello, World!");
});

test("runs a listener and stops it with default, graceful, and immediate options", async ({
	page,
}) => {
	test.setTimeout(120_000);

	const listenerCode = await loadFixture("listener.bal");
	const packageName = `e2e_listener_${Date.now()}`;

	await openPlayground(page);

	await createPackage(page, packageName);
	await replaceEditorContent(page, listenerCode);

	const runButton = page.getByTestId("run-button");
	await expect(runButton).toContainText("Run");
	await runButton.click();
	await expect(runButton).toContainText("Stop", { timeout: 10_000 });
	await runButton.click();
	await expect(page.getByTestId("output-pane")).toContainText(
		"Graceful stop initiated.",
		{
			timeout: 10_000,
		},
	);
	await expect(runButton).toContainText("Run", { timeout: 10_000 });

	await page.getByRole("button", { name: "Clear" }).click();
	await expect(page.getByTestId("output-pane")).toHaveText("");

	await runButton.click();
	await expect(runButton).toContainText("Stop", { timeout: 10_000 });
	await page.getByTestId("stop-options-button").click();
	await page.getByRole("menuitem", { name: "Graceful Stop (Default)" }).click();
	await expect(page.getByTestId("output-pane")).toContainText(
		"Graceful stop initiated.",
		{
			timeout: 10_000,
		},
	);
	await expect(runButton).toContainText("Run", { timeout: 10_000 });

	await page.getByRole("button", { name: "Clear" }).click();
	await expect(page.getByTestId("output-pane")).toHaveText("");

	await runButton.click();
	await expect(runButton).toContainText("Stop", { timeout: 10_000 });
	await page.getByTestId("stop-options-button").click();
	await page.getByRole("menuitem", { name: "Immediate Stop" }).click();
	await expect(page.getByTestId("output-pane")).toContainText(
		"Immediate stop initiated.",
		{
			timeout: 10_000,
		},
	);
	await expect(runButton).toContainText("Run", { timeout: 10_000 });
});

const SHARE_PAYLOAD =
	"H4sIAAAAAAAACnWQsWrDQBBEf%2BUylQ1CdtozaVKlNGl9Lk7SWl682j0uJ0MQ%2BvcgQZykSPuY2TfshGxW4CfcWDt4dJxRQeNA8OgzUWHtUaG9snSZFP70yF5Y6Cf8GkUos8a62CBLxbSQFnicUmxvsadzUMu9e3EBSeJnn23ULiDocmLFq3Ehd8ofbLrCff1c7wMwV%2F%2Boh8haN%2FGvlIdkubjme9aO7RA0aBob4dZdRm3LYljKm62bgjrnHJtPmbWIbgLeSMSeAraHoDPm81zBEuk7SSx8p2Ms119f2j1mzF%2FUrvUQVwEAAA%3D%3D";

test("opens a shared package and runs it", async ({ page }) => {
	test.setTimeout(120_000);

	await openPlayground(page, `/?share=${SHARE_PAYLOAD}`);

	const sharedPackage = page
		.getByRole("button", { name: "greeting" })
		.locator("xpath=ancestor::li[1]");
	await expect(sharedPackage).toBeVisible({ timeout: 10_000 });
	await expect(
		sharedPackage.locator('[data-sidebar="menu-button"]'),
	).toHaveCount(3);
	await expect(
		sharedPackage.getByRole("button", { name: "Ballerina.toml" }),
	).toBeVisible();
	await expect(
		sharedPackage.getByRole("button", { name: "main.bal" }),
	).toBeVisible();

	await runAndExpectOutput(page, "Hello!");
});
