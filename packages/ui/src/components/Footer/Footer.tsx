import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FooterProps extends React.HTMLAttributes<HTMLElement> {}

const Footer = React.forwardRef<HTMLElement, FooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <footer
        ref={ref}
        className={cn('border-t bg-background', 'h-12 flex items-center px-4', className)}
        {...props}
      >
        {children}
      </footer>
    );
  }
);
Footer.displayName = 'Footer';

const FooterLeft = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-4', className)} {...props} />
  )
);
FooterLeft.displayName = 'FooterLeft';

const FooterCenter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex-1 flex items-center justify-center', className)}
      {...props}
    />
  )
);
FooterCenter.displayName = 'FooterCenter';

const FooterRight = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-4', className)} {...props} />
  )
);
FooterRight.displayName = 'FooterRight';

export { Footer, FooterLeft, FooterCenter, FooterRight };
