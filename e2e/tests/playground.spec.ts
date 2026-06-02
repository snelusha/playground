import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

async function runAndExpectOutput(page: Page, expectedOutput: string) {
	const runButton = page.getByTestId("run-button");
	await expect(runButton).toBeEnabled({ timeout: 10_000 });

	await runButton.click();
	await expect(runButton).toContainText("[...]");
	await expect(runButton).toContainText("Run", { timeout: 10_000 });

	await expect(page.getByTestId("output-pane")).toHaveText(expectedOutput, {
		timeout: 10_000,
	});
}

test("creates a package and runs hello world", async ({ page }) => {
	test.setTimeout(120_000);

	const packageName = `e2e_pkg_${Date.now()}`;

	await page.goto("/");

	await expect(page.getByTestId("wasm-loading")).toBeHidden({
		timeout: 90_000,
	});

	const runButton = page.getByTestId("run-button");
	await expect(runButton).toBeEnabled({ timeout: 10_000 });

	await page.getByTestId("localspace-add").click();
	await page.getByRole("menuitem", { name: "New Package" }).click();

	const dialog = page.getByTestId("file-tree-dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Name").fill(packageName);
	await dialog.getByRole("button", { name: "Create" }).click();
	await expect(dialog).toBeHidden();

	await expect(page.getByText(packageName)).toBeVisible();

	await runAndExpectOutput(page, "Hello, World!");
});

const SHARE_PAYLOAD =
	"H4sIAAAAAAAACnWQsWrDQBBEf%2BUylQ1CdtozaVKlNGl9Lk7SWl682j0uJ0MQ%2BvcgQZykSPuY2TfshGxW4CfcWDt4dJxRQeNA8OgzUWHtUaG9snSZFP70yF5Y6Cf8GkUos8a62CBLxbSQFnicUmxvsadzUMu9e3EBSeJnn23ULiDocmLFq3Ehd8ofbLrCff1c7wMwV%2F%2Boh8haN%2FGvlIdkubjme9aO7RA0aBob4dZdRm3LYljKm62bgjrnHJtPmbWIbgLeSMSeAraHoDPm81zBEuk7SSx8p2Ms119f2j1mzF%2FUrvUQVwEAAA%3D%3D";

test("opens a shared package and runs it", async ({ page }) => {
	test.setTimeout(120_000);

	await page.goto(`/?share=${SHARE_PAYLOAD}`);

	await expect(page.getByTestId("wasm-loading")).toBeHidden({
		timeout: 90_000,
	});

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
