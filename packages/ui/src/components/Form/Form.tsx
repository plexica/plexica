import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '../Label/Label';

// --- Form Context ---

interface FormFieldContextValue {
  id: string;
  name: string;
  error?: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function useFormField() {
  const context = React.useContext(FormFieldContext);
  if (!context) {
    throw new Error('useFormField must be used within a <FormField>');
  }
  return context;
}

// --- Form ---

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {}

const Form = React.forwardRef<HTMLFormElement, FormProps>(({ className, ...props }, ref) => {
  return <form ref={ref} className={cn('space-y-6', className)} {...props} />;
});
Form.displayName = 'Form';

// --- FormField ---

export interface FormFieldProps {
  /** Unique field name, used for id generation and error association. */
  name: string;
  /** Optional error message for this field. */
  error?: string;
  /** Field contents (FormItem, FormLabel, FormControl, etc.) */
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ name, error, children }) => {
  const id = React.useId();
  const value = React.useMemo(() => ({ id: `${id}-form-item`, name, error }), [id, name, error]);
  return <FormFieldContext.Provider value={value}>{children}</FormFieldContext.Provider>;
};
FormField.displayName = 'FormField';

// --- FormItem ---

export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {}

const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('space-y-2', className)} {...props} />;
});
FormItem.displayName = 'FormItem';

// --- FormLabel ---

export interface FormLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {}

const FormLabel = React.forwardRef<React.ComponentRef<typeof Label>, FormLabelProps>(
  ({ className, ...props }, ref) => {
    const { id, error } = useFormField();
    return (
      <Label
        ref={ref}
        htmlFor={id}
        className={cn(error && 'text-destructive', className)}
        {...props}
      />
    );
  }
);
FormLabel.displayName = 'FormLabel';

// --- FormControl ---

export interface FormControlProps extends React.HTMLAttributes<HTMLDivElement> {}

const FormControl = React.forwardRef<HTMLDivElement, FormControlProps>(
  ({ className, children, ...props }, ref) => {
    const { id, error, name } = useFormField();
    return (
      <div ref={ref} className={cn(className)} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              id,
              name,
              'aria-invalid': error ? true : undefined,
              'aria-describedby': error ? `${id}-message` : undefined,
            });
          }
          return child;
        })}
      </div>
    );
  }
);
FormControl.displayName = 'FormControl';

// --- FormDescription ---

export interface FormDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const FormDescription = React.forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
  }
);
FormDescription.displayName = 'FormDescription';

// --- FormMessage ---

export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Override the error from FormField context. */
  error?: string;
}

const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, error: errorProp, children, ...props }, ref) => {
    const field = useFormField();
    const message = errorProp ?? field.error;

    if (!message && !children) return null;

    return (
      <p
        ref={ref}
        id={`${field.id}-message`}
        role="alert"
        className={cn('text-sm font-medium text-destructive', className)}
        {...props}
      >
        {message ?? children}
      </p>
    );
  }
);
FormMessage.displayName = 'FormMessage';

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};
