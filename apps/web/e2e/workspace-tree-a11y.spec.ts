import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, uniqueName } from './helpers/admin-login.js';
import {
  createWorkspace,
  navigateToWorkspaceById,
  openCreateWorkspaceDialog,
} from './helpers/workspace.js';

test.describe('Workspace hierarchy tree accessibility', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('supports the ARIA tree keyboard model, parent selection, Tab exit, and WCAG 2.1 AA', async ({
    page,
  }) => {
    const rootName = uniqueName('tree-a11y-root');
    const childName = `${rootName}-child`;
    const siblingName = `${rootName}-sibling`;
    const grandchildName = `${rootName}-grandchild`;

    await createWorkspace(page, { name: rootName });
    const childId = await createWorkspace(page, {
      name: childName,
      parentWorkspaceName: rootName,
    });
    await createWorkspace(page, { name: siblingName });
    await openCreateWorkspaceDialog(page);

    const dialog = page.getByRole('dialog');
    const parentSelector = dialog.getByRole('group', { name: 'Parent workspace' });
    await parentSelector.getByRole('textbox', { name: 'Search workspaces' }).fill(rootName);

    const tree = parentSelector.getByRole('tree', { name: 'Workspace hierarchy' });
    const root = tree.getByRole('treeitem', { name: rootName, exact: true });
    const child = tree.getByRole('treeitem', { name: childName, exact: true });
    const sibling = tree.getByRole('treeitem', { name: siblingName, exact: true });

    await expect(root).toHaveAttribute('aria-level', '1');
    await expect(root).toHaveAttribute('aria-expanded', 'true');
    await expect(child).toHaveAttribute('aria-level', '2');
    await expect(sibling).toHaveAttribute('aria-level', '1');
    await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await root.click();

    await page.keyboard.press('ArrowDown');
    await expect(child).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(root).toBeFocused();
    await page.keyboard.press('End');
    await expect(sibling).toBeFocused();
    await page.keyboard.press('Home');
    await expect(root).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(root).toHaveAttribute('aria-expanded', 'false');
    await expect(child).toBeHidden();
    await expect(root).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(root).toHaveAttribute('aria-expanded', 'true');
    await expect(root).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(child).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(root).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect(child).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Tab');
    const noParent = parentSelector.getByRole('button', { name: 'No parent workspace' });
    await expect(noParent).toBeFocused();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await dialog.getByLabel(/^name$/i).fill(grandchildName);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/workspaces') &&
        response.request().method() === 'POST' &&
        !response.url().includes('/members') &&
        !response.url().includes('/templates')
    );
    await dialog.getByRole('button', { name: 'Create' }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const grandchild = (await response.json()) as { id: string };

    await navigateToWorkspaceById(page, grandchild.id);
    const parentLink = page.getByRole('link', { name: childName, exact: true });
    await expect(parentLink).toHaveAttribute('href', `/workspaces/${childId}`);
  });
});
