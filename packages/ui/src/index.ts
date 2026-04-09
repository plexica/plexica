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

export { ConfirmDialog } from './components/confirm-dialog.js';
export type { ConfirmDialogProps } from './components/confirm-dialog.js';

export { FileUpload } from './components/file-upload.js';
export type { FileUploadProps } from './components/file-upload.js';

export { ToggleSwitch } from './components/toggle-switch.js';
export type { ToggleSwitchProps } from './components/toggle-switch.js';

export { DateRangePicker } from './components/date-range-picker.js';
export type { DateRangePickerProps } from './components/date-range-picker.js';

export { InlineFilter } from './components/inline-filter.js';
export type { InlineFilterProps, FilterDef, FilterValues } from './components/inline-filter.js';

export { Pagination } from './components/pagination.js';
export type { PaginationProps } from './components/pagination.js';

export { Select } from './components/select.js';
export type { SelectProps, SelectOption } from './components/select.js';

export { Badge } from './components/badge.js';
export type { BadgeProps, BadgeVariant } from './components/badge.js';

export { Tabs } from './components/tabs.js';
export type { TabsProps, TabDef } from './components/tabs.js';

export { Textarea } from './components/textarea.js';
export type { TextareaProps } from './components/textarea.js';

export {
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from './components/popover.js';

// Utilities
export { cn } from './lib/cn.js';
