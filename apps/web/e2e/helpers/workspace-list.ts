// workspace-list.ts
// Workspace list lookup helpers that prefer the user-facing search filter.

import { expect, type Locator, type Page, type Response } from '@playwright/test';

function isWorkspaceListResponse(response: Response, search?: string): boolean {
  const url = new URL(response.url());
  return (
    url.pathname.endsWith('/api/v1/workspaces') &&
    response.request().method() === 'GET' &&
    response.status() === 200 &&
    (search === undefined || url.searchParams.get('search') === search)
  );
}

function exactWorkspaceLink(page: Page, workspaceName: string): Locator {
  return page.getByRole('link', { name: workspaceName, exact: true });
}

async function workspaceSearchInput(page: Page): Promise<Locator | null> {
  const filters = page.locator('main').getByRole('search', { name: /filters/i });
  await filters.waitFor({ state: 'visible' });
  const input = filters
    .getByRole('searchbox')
    .or(filters.getByRole('textbox', { name: /search|name/i }))
    .first();
  return (await input.count()) > 0 ? input : null;
}

async function searchForWorkspace(
  page: Page,
  workspaceName: string,
  searchInput: Locator
): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    isWorkspaceListResponse(response, workspaceName)
  );
  await searchInput.fill(workspaceName);
  await responsePromise;
  await expect(searchInput).toHaveValue(workspaceName);
  await expect(exactWorkspaceLink(page, workspaceName)).toBeVisible();
}

async function paginateToWorkspace(page: Page, workspaceName: string): Promise<void> {
  const visitedPages = new Set<number>();
  while (!(await exactWorkspaceLink(page, workspaceName).isVisible().catch(() => false))) {
    const nextButton = page.getByRole('button', { name: /next page/i });
    if ((await nextButton.count()) === 0 || (await nextButton.isDisabled())) break;

    const pagination = page.getByRole('navigation', { name: /pagination/i });
    const pageText = (await pagination.textContent()) ?? '';
    const currentPage = Number(pageText.match(/Page\s+(\d+)\s+of/)?.[1]);
    const expectedPage = currentPage + 1;
    if (!Number.isInteger(expectedPage) || visitedPages.has(expectedPage)) {
      throw new Error(`Workspace pagination did not advance from "${pageText.trim()}"`);
    }

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        isWorkspaceListResponse(response) &&
        url.searchParams.get('page') === String(expectedPage)
      );
    });
    await nextButton.click();
    await responsePromise;
    visitedPages.add(expectedPage);
    await expect(pagination).toContainText(new RegExp(`Page\\s+${expectedPage}\\s+of`));
  }

  await expect(exactWorkspaceLink(page, workspaceName)).toBeVisible();
}

export async function findWorkspaceInList(page: Page, workspaceName: string): Promise<void> {
  const initialResponse = page.waitForResponse((response) => isWorkspaceListResponse(response));
  await page.goto('/workspaces');
  await initialResponse;

  const searchInput = await workspaceSearchInput(page);
  if (searchInput !== null) {
    await searchForWorkspace(page, workspaceName, searchInput);
    return;
  }

  // Compatibility fallback for deployments whose list filter has no text search yet.
  await paginateToWorkspace(page, workspaceName);
}
