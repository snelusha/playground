import { test, expect } from "@playwright/test";

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
	await expect(runButton).toBeEnabled();

	await runButton.click();
	await expect(runButton).toContainText("[...]");
	await expect(runButton).toContainText("Run", { timeout: 10_000 });

	const output = page.getByTestId("output-pane");
	await expect(output).toContainText("Hello, World!", { timeout: 10_000 });
});
