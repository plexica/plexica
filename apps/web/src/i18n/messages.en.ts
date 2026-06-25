// messages.en.ts — English (default) translations for apps/web
// All UI strings must go through react-intl — no hardcoded text in components.
// Domain-split to stay under 200 lines per file (Constitution Rule 4).

import { messagesAuthNav } from './messages.en.auth-nav.js';
import { messagesWorkspaceUsers } from './messages.en.workspace-users.js';
import { messagesSettingsCommon } from './messages.en.settings-common.js';

export const messages = {
  ...messagesAuthNav,
  ...messagesWorkspaceUsers,
  ...messagesSettingsCommon,
} as const;

export type MessageKey = keyof typeof messages;
