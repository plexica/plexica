// deletion-saga.service.ts
// Stable public surface for the focused deletion saga modules (S5-700).

export {
  startDeletionSaga,
  type DeletionSagaStartResult,
  type SagaStepSummary,
} from './deletion-saga-start.service.js';
export { runSagaSteps } from './deletion-saga-runner.service.js';
export { getDeletionStatus } from './deletion-saga-status.service.js';
export { startupSweep } from './deletion-saga-recovery.service.js';
