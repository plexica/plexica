// apps/super-admin/src/hooks/useWizardState.ts
// T001-22: Wizard state management hook per ADR-016.
// Uses useReducer for step navigation + cross-step data accumulation.
// Persists to sessionStorage for crash recovery.

import { useReducer, useEffect } from 'react';
import type {
  BasicsFormData,
  PluginsFormData,
  ThemeFormData,
} from '@/components/tenants/wizard-schemas';

// ─── State Shape (ADR-016) ────────────────────────────────────────────────────

export type WizardStepIndex = 1 | 2 | 3 | 4;
export type WizardPhase = 'filling' | 'provisioning' | 'success' | 'error';

export interface WizardData {
  basics: BasicsFormData | null;
  plugins: PluginsFormData | null;
  theme: ThemeFormData | null;
}

export interface WizardState {
  step: WizardStepIndex;
  phase: WizardPhase;
  data: WizardData;
  /** Error message from provisioning failure */
  provisioningError: string | null;
  /** ID of the newly created tenant (set on success) */
  newTenantId: string | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: 'COMPLETE_STEP_1'; data: BasicsFormData }
  | { type: 'COMPLETE_STEP_2'; data: PluginsFormData }
  | { type: 'COMPLETE_STEP_3'; data: ThemeFormData }
  | { type: 'GO_BACK' }
  | { type: 'SKIP_STEP' }
  | { type: 'GO_TO_STEP'; step: WizardStepIndex }
  | { type: 'START_PROVISIONING' }
  | { type: 'PROVISIONING_SUCCESS'; tenantId: string }
  | { type: 'PROVISIONING_ERROR'; error: string }
  | { type: 'RESET' };

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: WizardState = {
  step: 1,
  phase: 'filling',
  data: { basics: null, plugins: null, theme: null },
  provisioningError: null,
  newTenantId: null,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'COMPLETE_STEP_1':
      return {
        ...state,
        step: 2,
        data: { ...state.data, basics: action.data },
      };

    case 'COMPLETE_STEP_2':
      return {
        ...state,
        step: 3,
        data: { ...state.data, plugins: action.data },
      };

    case 'COMPLETE_STEP_3':
      return {
        ...state,
        step: 4,
        data: { ...state.data, theme: action.data },
      };

    case 'GO_BACK':
      if (state.step <= 1) return state;
      return { ...state, step: (state.step - 1) as WizardStepIndex };

    case 'SKIP_STEP':
      // Advance without saving data for this step
      if (state.step === 2)
        return { ...state, step: 3, data: { ...state.data, plugins: { pluginIds: [] } } };
      if (state.step === 3) return { ...state, step: 4, data: { ...state.data, theme: null } };
      return state;

    case 'GO_TO_STEP':
      // Only allow jumping back to already-completed steps
      if (action.step < state.step) {
        return { ...state, step: action.step };
      }
      return state;

    case 'START_PROVISIONING':
      return { ...state, phase: 'provisioning', provisioningError: null };

    case 'PROVISIONING_SUCCESS':
      return { ...state, phase: 'success', newTenantId: action.tenantId };

    case 'PROVISIONING_ERROR':
      return { ...state, phase: 'error', provisioningError: action.error };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'plexica-create-tenant-wizard';

export function useWizardState() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, (): WizardState => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WizardState;
        // Only restore if in the filling phase — don't restore mid-provisioning
        if (parsed.phase === 'filling') return parsed;
      }
    } catch {
      // sessionStorage unavailable or corrupt — ignore
    }
    return initialState;
  });

  // Persist to sessionStorage whenever the wizard is in filling phase.
  // Clear storage when provisioning starts (or on reset).
  useEffect(() => {
    if (state.phase === 'filling') {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage full or unavailable — non-fatal
      }
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [state]);

  return [state, dispatch] as const;
}
