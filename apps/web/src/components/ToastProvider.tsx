// apps/web/src/components/ToastProvider.tsx

import { Toaster } from 'sonner';

/**
 * ToastProvider Component
 *
 * Provides toast notification functionality throughout the app
 * Uses Sonner library for toast notifications
 *
 * Place this in your root layout component
 *
 * @example
 * ```tsx
 * export function App() {
 *   return (
 *     <>
 *       <YourApp />
 *       <ToastProvider />
 *     </>
 *   );
 * }
 * ```
 */
export function ToastProvider() {
  return <Toaster position="top-right" richColors closeButton theme="system" />;
}

/**
 * Toast utility functions
 *
 * Use these throughout your app to show toasts
 *
 * @example
 * ```tsx
 * import { toast } from 'sonner';
 *
 * // Success
 * toast.success('Settings saved!');
 *
 * // Error
 * toast.error('Failed to save settings');
 *
 * // Info
 * toast.info('Processing your request...');
 *
 * // Warning
 * toast.warning('This action cannot be undone');
 *
 * // Custom
 * toast.custom((t) => (
 *   <div>Custom toast content</div>
 * ));
 * ```
 */
export { toast } from 'sonner';
