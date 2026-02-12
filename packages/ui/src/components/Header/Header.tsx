import * as React from 'react';
import { cn } from '@/lib/utils';

export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

const Header = React.forwardRef<HTMLElement, HeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <header
        ref={ref}
        className={cn(
          'sticky top-0 z-40 w-full border-b bg-background',
          'h-16 flex items-center px-4',
          className
        )}
        {...props}
      >
        {children}
      </header>
    );
  }
);
Header.displayName = 'Header';

const HeaderLeft = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-4', className)} {...props} />
  )
);
HeaderLeft.displayName = 'HeaderLeft';

const HeaderCenter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex-1 flex items-center justify-center px-4', className)}
      {...props}
    />
  )
);
HeaderCenter.displayName = 'HeaderCenter';

const HeaderRight = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-4', className)} {...props} />
  )
);
HeaderRight.displayName = 'HeaderRight';

const HeaderLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 font-semibold text-lg cursor-pointer', className)}
      {...props}
    >
      {children}
    </div>
  )
);
HeaderLogo.displayName = 'HeaderLogo';

export { Header, HeaderLeft, HeaderCenter, HeaderRight, HeaderLogo };
