// index.ts — barrel export for @plexica/ui

// Components
export { Button } from './components/button.js';
export type { ButtonProps } from './components/button.js';

export { Input } from './components/input.js';
export type { InputProps } from './components/input.js';

export {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './components/dialog.js';

export { ToastProvider, ToastViewport, Toast } from './components/toast.js';
export type { ToastProps } from './components/toast.js';

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './components/table.js';
export type { TableHeadProps } from './components/table.js';

export {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './components/dropdown-menu.js';

// Utilities
export { cn } from './lib/cn.js';
