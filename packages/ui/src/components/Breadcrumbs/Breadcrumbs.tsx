import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
}

const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ items, separator, className }, ref) => {
    const defaultSeparator = <ChevronRight className="h-4 w-4 text-text-secondary" />;

    return (
      <nav ref={ref} aria-label="Breadcrumb" className={cn('flex items-center space-x-1', className)}>
        <ol className="flex items-center space-x-1">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isCurrent = item.current || isLast;

            return (
              <li key={index} className="flex items-center">
                {index > 0 && (
                  <span className="mx-2" aria-hidden="true">
                    {separator || defaultSeparator}
                  </span>
                )}
                {isCurrent ? (
                  <span
                    className="text-sm font-medium text-text-primary"
                    aria-current="page"
                  >
                    {item.label}
                  </span>
                ) : (
                  <a
                    href={item.href || '#'}
                    className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
);
Breadcrumbs.displayName = 'Breadcrumbs';

const BreadcrumbsWithHome = React.forwardRef<HTMLElement, Omit<BreadcrumbsProps, 'items'> & { items: BreadcrumbItem[] }>(
  ({ items, ...props }, ref) => {
    const itemsWithHome: BreadcrumbItem[] = [
      { label: 'Home', href: '/' },
      ...items,
    ];

    return <Breadcrumbs ref={ref} items={itemsWithHome} {...props} />;
  }
);
BreadcrumbsWithHome.displayName = 'BreadcrumbsWithHome';

export { Breadcrumbs, BreadcrumbsWithHome };
