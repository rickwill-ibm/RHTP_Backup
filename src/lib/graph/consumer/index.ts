/**
 * graph/consumer — the outbox->projector live consumer (HW1 / I14, REC-01).
 * Wires the previously-unwired projection path to a real entry point (the ops
 * projection-run route + scheduler). Program-spine contract C-STORE (consumer half).
 */
export {
  runProjectionOnce,
  type ProjectionConsumerDeps,
  type ProjectionRunResult,
} from './projectionConsumer';
export {
  createMemoryCheckpointStore,
  getProjectionCheckpointStore,
  setProductionCheckpointFactory,
  ProjectionCheckpointNotConfiguredError,
  type ProjectionCheckpointStore,
} from './checkpoint';
