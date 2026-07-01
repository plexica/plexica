// uninstall-dialog.tsx
// Confirmation dialog with data loss warning before uninstalling a plugin.
// Uses ConfirmDialog — no window.confirm() (Constitution Rule).

import { useIntl } from 'react-intl';
import { ConfirmDialog } from '@plexica/ui';

interface UninstallDialogProps {
  isOpen: boolean;
  pluginName: string;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UninstallDialog({
  isOpen,
  pluginName,
  isProcessing,
  onConfirm,
  onCancel,
}: UninstallDialogProps): JSX.Element | null {
  const intl = useIntl();
  if (!isOpen) return null;

  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(open: boolean) => { if (!open) onCancel(); }}
      title={intl.formatMessage({ id: 'plugins.uninstall.confirm' }, { name: pluginName })}
      description={intl.formatMessage({ id: 'plugins.uninstall.warning' }, { name: pluginName })}
      confirmLabel={intl.formatMessage({ id: 'plugins.uninstall.confirmButton' })}
      variant="destructive"
      loading={isProcessing}
      onConfirm={onConfirm}
    />
  );
}
