// File: apps/super-admin/src/hooks/use-toast.ts

import { toast as sonnerToast } from 'sonner';

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'destructive';

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

/**
 * Custom toast hook wrapping Sonner
 * Provides a consistent API for showing toast notifications
 */
export const useToast = () => {
  const toast = ({ title, description, variant = 'default', duration }: ToastOptions) => {
    const message = title || description || '';
    const descriptionText = title && description ? description : undefined;

    const options = {
      description: descriptionText,
      duration,
    };

    switch (variant) {
      case 'success':
        sonnerToast.success(message, options);
        break;
      case 'error':
      case 'destructive':
        sonnerToast.error(message, options);
        break;
      case 'warning':
        sonnerToast.warning(message, options);
        break;
      case 'info':
        sonnerToast.info(message, options);
        break;
      default:
        sonnerToast(message, options);
    }
  };

  return { toast };
};
