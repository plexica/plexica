import type { Locator, Page } from '@playwright/test';

/** Waits for expected authenticated content and surfaces any real app error. */
export async function waitForRouteContent(
  page: Page,
  content: Locator,
  description: string,
  timeout = 15_000
): Promise<void> {
  try {
    await content.waitFor({ state: 'visible', timeout });
  } catch (error) {
    const alert = page.getByRole('alert').first();
    if (await alert.isVisible().catch(() => false)) {
      throw new Error(
        `${description} did not load; application alert: ${(await alert.innerText()).trim()}`
      );
    }
    throw error;
  }
}
