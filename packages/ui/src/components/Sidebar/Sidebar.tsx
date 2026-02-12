import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, collapsed = false, onCollapsedChange, children, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        className={cn(
          'sticky top-16 h-[calc(100vh-4rem)] border-r bg-background transition-all duration-300',
          collapsed ? 'w-16' : 'w-60',
          className
        )}
        {...props}
      >
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto py-4">{children}</div>
          {onCollapsedChange && (
            <div className="border-t p-2">
              <button
                onClick={() => onCollapsedChange(!collapsed)}
                className="w-full flex items-center justify-center p-2 rounded hover:bg-accent transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </aside>
    );
  }
);
Sidebar.displayName = 'Sidebar';

export interface SidebarSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

const SidebarSection = React.forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className, title, children, ...props }, ref) => (
    <div ref={ref} className={cn('px-3 py-2', className)} {...props}>
      {title && (
        <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
);
SidebarSection.displayName = 'SidebarSection';

export interface SidebarItemProps extends React.HTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode;
  active?: boolean;
  collapsed?: boolean;
  badge?: string | number;
}

const SidebarItem = React.forwardRef<HTMLAnchorElement, SidebarItemProps>(
  ({ className, icon, active, collapsed, badge, children, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-accent hover:text-foreground',
        active
          ? 'bg-accent text-foreground border-l-[3px] border-l-primary'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2',
        className
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {!collapsed && (
        <>
          <span className="flex-1">{children}</span>
          {badge && (
            <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {badge}
            </span>
          )}
        </>
      )}
    </a>
  )
);
SidebarItem.displayName = 'SidebarItem';

const SidebarDivider = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr ref={ref} className={cn('my-2 border-t border-border', className)} {...props} />
  )
);
SidebarDivider.displayName = 'SidebarDivider';

export { Sidebar, SidebarSection, SidebarItem, SidebarDivider };
