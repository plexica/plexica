// messages.it.ts — Italian translations for apps/web.
// Domain-split to stay under 200 lines per file (Constitution Rule 4).

import { messagesItAuthNav } from './messages.it.auth-nav.js';
import { messagesItWorkspaceUsers } from './messages.it.workspace-users.js';
import { messagesItSettingsCommon } from './messages.it.settings-common.js';
import { messagesItPlugins } from './messages.it.plugins.js';
import { messagesItNotifications } from './messages.it.notifications.js';

export const messagesIt = {
  ...messagesItAuthNav,
  ...messagesItWorkspaceUsers,
  ...messagesItSettingsCommon,
  ...messagesItPlugins,
  ...messagesItNotifications,
} as const;