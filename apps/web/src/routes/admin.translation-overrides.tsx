// apps/web/src/routes/admin.translation-overrides.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api-client';
import { useTranslations } from '../hooks/useTranslations';
import {
  Button,
  Input,
  Label,
  Textarea,
  Card,
  Alert,
  AlertDescription,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@plexica/ui';
import { Search, Save, AlertCircle, Check, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ToastProvider';
import { z } from 'zod';

export const Route = createFileRoute('/admin/translation-overrides' as any)({
  component: TranslationOverridesPage,
});

// Validation schema for translation overrides
const overrideValueSchema = z
  .string()
  .max(5000, 'Translation value must be 5000 characters or less');

interface TranslationEntry {
  key: string;
  namespace: string;
  locale: string;
  originalValue: string;
  overrideValue: string | null;
  isOrphaned: boolean;
}

interface TenantOverrides {
  [locale: string]: {
    [namespace: string]: {
      [key: string]: string;
    };
  };
}

function TranslationOverridesPage() {
  const { user, tenant } = useAuthStore();
  const [selectedLocale, setSelectedLocale] = useState<string>('en');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('core');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<TenantOverrides>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // RBAC check: Only tenant_admin can access this page
  const isTenantAdmin = user?.roles?.includes('tenant_admin') ?? false;

  // Load available namespaces from enabled plugins
  const availableNamespaces = ['core', 'auth', 'workspace']; // TODO: Get from API

  // Load translations for selected namespace
  const { data: translationsData, isLoading: isLoadingTranslations } = useTranslations({
    namespace: selectedNamespace,
    locale: selectedLocale,
    enabled: isTenantAdmin,
  });

  // Load existing tenant overrides
  useEffect(() => {
    if (!isTenantAdmin) return;

    const loadOverrides = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiClient.get<{ overrides: TenantOverrides }>(
          '/api/v1/tenant/translations/overrides'
        );
        setOverrides(response.overrides || {});
      } catch (err: any) {
        const errorMessage = err.response?.data?.error?.message || 'Failed to load overrides';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadOverrides();
  }, [isTenantAdmin]);

  // Build translation entries from loaded translations
  const translationEntries = useMemo<TranslationEntry[]>(() => {
    if (!translationsData) return [];

    const messages = translationsData.messages || {};
    const entries: TranslationEntry[] = [];

    // Get overrides for current locale/namespace
    const currentOverrides = overrides[selectedLocale]?.[selectedNamespace] || {};

    // Convert messages to entries
    Object.entries(messages).forEach(([key, value]) => {
      entries.push({
        key,
        namespace: selectedNamespace,
        locale: selectedLocale,
        originalValue: String(value),
        overrideValue: currentOverrides[key] || null,
        isOrphaned: false,
      });
    });

    // Add orphaned overrides (overrides without base translation)
    Object.entries(currentOverrides).forEach(([key, value]) => {
      if (!messages[key]) {
        entries.push({
          key,
          namespace: selectedNamespace,
          locale: selectedLocale,
          originalValue: '',
          overrideValue: value,
          isOrphaned: true,
        });
      }
    });

    return entries;
  }, [translationsData, overrides, selectedLocale, selectedNamespace]);

  // Filter entries by search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return translationEntries;

    const query = searchQuery.toLowerCase();
    return translationEntries.filter(
      (entry) =>
        entry.key.toLowerCase().includes(query) ||
        entry.originalValue.toLowerCase().includes(query) ||
        entry.overrideValue?.toLowerCase().includes(query)
    );
  }, [translationEntries, searchQuery]);

  // Handle edit value change
  const handleEditChange = useCallback((key: string, value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Validate edited value
  const validateValue = (value: string): string | null => {
    try {
      overrideValueSchema.parse(value);
      return null;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return err.issues[0]?.message || 'Invalid value';
      }
      return 'Invalid value';
    }
  };

  // Handle save overrides
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Build override payload
      const newOverrides: TenantOverrides = { ...overrides };

      // Ensure locale and namespace objects exist
      if (!newOverrides[selectedLocale]) {
        newOverrides[selectedLocale] = {};
      }
      if (!newOverrides[selectedLocale][selectedNamespace]) {
        newOverrides[selectedLocale][selectedNamespace] = {};
      }

      // Apply edited values
      Object.entries(editedValues).forEach(([key, value]) => {
        if (value.trim() === '') {
          // Remove override if empty
          delete newOverrides[selectedLocale][selectedNamespace][key];
        } else {
          // Validate before saving
          const validationError = validateValue(value);
          if (validationError) {
            throw new Error(`Invalid value for key "${key}": ${validationError}`);
          }
          newOverrides[selectedLocale][selectedNamespace][key] = value;
        }
      });

      // Save to backend
      await apiClient.put('/api/v1/tenant/translations/overrides', {
        overrides: newOverrides,
      });

      // Update local state
      setOverrides(newOverrides);
      setEditedValues({});
      setHasUnsavedChanges(false);
      toast.success('Translation overrides saved successfully!');
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message || err.message || 'Failed to save overrides';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset changes
  const handleReset = () => {
    setEditedValues({});
    setHasUnsavedChanges(false);
    toast.success('Changes reset');
  };

  // RBAC: Access denied for non-admin users
  if (!isTenantAdmin) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <Card className="p-8 max-w-md text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">
                You need the <Badge variant="danger">tenant_admin</Badge> role to access translation
                overrides.
              </p>
              <p className="text-sm text-muted-foreground">
                Please contact your tenant administrator for access.
              </p>
            </Card>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Translation Overrides</h1>
          <p className="text-muted-foreground">
            Customize translations for your tenant. Overrides apply to all workspaces in{' '}
            <strong>{tenant?.name || 'this tenant'}</strong>.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Unsaved Changes Warning */}
        {hasUnsavedChanges && (
          <Alert className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              You have unsaved changes. Click <strong>Save Changes</strong> to apply them.
            </AlertDescription>
          </Alert>
        )}

        {/* Filters & Search */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Locale Selector */}
            <div>
              <Label htmlFor="locale-select">Locale</Label>
              <Select value={selectedLocale} onValueChange={setSelectedLocale}>
                <SelectTrigger id="locale-select" className="mt-2">
                  <SelectValue placeholder="Select locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English (en)</SelectItem>
                  <SelectItem value="it">Italiano (it)</SelectItem>
                  <SelectItem value="es">Español (es)</SelectItem>
                  <SelectItem value="fr">Français (fr)</SelectItem>
                  <SelectItem value="de">Deutsch (de)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Namespace Selector */}
            <div>
              <Label htmlFor="namespace-select">Namespace</Label>
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger id="namespace-select" className="mt-2">
                  <SelectValue placeholder="Select namespace" />
                </SelectTrigger>
                <SelectContent>
                  {availableNamespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div>
              <Label htmlFor="search-input">Search Keys</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-input"
                  type="text"
                  placeholder="Search translation keys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasUnsavedChanges || isSaving}
            >
              Reset
            </Button>
          </div>
        </Card>

        {/* Translation Entries */}
        {isLoading || isLoadingTranslations ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              {searchQuery
                ? 'No translations found matching your search.'
                : 'No translations available for this locale and namespace.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredEntries.map((entry) => (
              <TranslationEntryCard
                key={`${entry.locale}-${entry.namespace}-${entry.key}`}
                entry={entry}
                editedValue={editedValues[entry.key]}
                onEditChange={(value) => handleEditChange(entry.key, value)}
                validateValue={validateValue}
              />
            ))}
          </div>
        )}

        {/* Stats Footer */}
        <div className="mt-6 text-sm text-muted-foreground text-center">
          Showing {filteredEntries.length} of {translationEntries.length} translation keys
          {translationEntries.some((e) => e.isOrphaned) && (
            <span className="ml-2">
              • {translationEntries.filter((e) => e.isOrphaned).length} orphaned override(s)
            </span>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

// ─── Translation Entry Card Component ────────────────────────────────────────

interface TranslationEntryCardProps {
  entry: TranslationEntry;
  editedValue: string | undefined;
  onEditChange: (value: string) => void;
  validateValue: (value: string) => string | null;
}

function TranslationEntryCard({
  entry,
  editedValue,
  onEditChange,
  validateValue,
}: TranslationEntryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const currentValue = editedValue ?? entry.overrideValue ?? '';
  const hasOverride = entry.overrideValue !== null || editedValue !== undefined;
  const validationError = currentValue ? validateValue(currentValue) : null;

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Original Translation */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">Translation Key</Label>
            {entry.isOrphaned && (
              <Badge variant="danger" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Orphaned
              </Badge>
            )}
          </div>
          <p className="text-sm font-mono text-foreground mb-3 break-all">{entry.key}</p>

          <Label className="text-xs text-muted-foreground">Original Value</Label>
          <div className="mt-2 p-3 bg-muted rounded-md text-sm text-muted-foreground break-words">
            {entry.originalValue || (
              <span className="italic text-destructive">No base translation</span>
            )}
          </div>
        </div>

        {/* Right: Override Value */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor={`override-${entry.key}`} className="text-xs text-muted-foreground">
              Tenant Override
            </Label>
            {hasOverride && !isEditing && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>

          {isEditing || hasOverride ? (
            <>
              <Textarea
                id={`override-${entry.key}`}
                value={currentValue}
                onChange={(e) => onEditChange(e.target.value)}
                placeholder="Enter custom translation..."
                rows={3}
                className="text-sm"
                maxLength={5000}
              />
              {validationError && (
                <Alert variant="destructive" className="mt-2 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{validationError}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  {currentValue.length} / 5000 characters
                </p>
                {isEditing && !hasOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      onEditChange('');
                    }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground italic">
                No override set
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="w-full"
              >
                Add Override
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Orphaned Override Warning */}
      {entry.isOrphaned && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Orphaned Override:</strong> This override does not have a corresponding base
            translation. It may be from a disabled plugin or a deleted translation key. Consider
            removing it.
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
