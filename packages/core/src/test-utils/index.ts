/**
 * Internal test-utilities barrel. NOT part of the public `@kinesisjs/core`
 * package surface — never re-exported from `packages/core/src/index.ts`.
 * Consumers reach this module via the `@kinesisjs/test-utils` Vitest alias
 * (see root vitest.config.ts).
 */

export { CROSS_ADAPTER_SCENARIOS, checkParity, recordAdapter, runScenario } from './cross-adapter';

export type {
  ExpectedCall,
  ParityAssertionResult,
  RecordedCall,
  Scenario,
  ScenarioStep,
} from './cross-adapter';
