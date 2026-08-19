/**
 * Compatibility exports for the shared Atomic model-failure classifier.
 *
 * Implementations stay on `@bastani/atomic`; this module forwards after the
 * barrel has been lazy-loaded so importing it does not load atomic at startup.
 */

export type {
	ModelFallbackFailureKind,
	ModelFallbackFailureSignal,
	ModelFallbackFailureSource,
} from "@bastani/atomic";
import type { AtomicModule } from "../../shared/atomic-runtime.js";
import { getAtomic } from "../../shared/atomic-runtime.js";

export function errorMessage(
	...args: Parameters<AtomicModule["errorMessage"]>
): ReturnType<AtomicModule["errorMessage"]> {
	return getAtomic().errorMessage(...args);
}

export function isRetryableModelFailure(
	...args: Parameters<AtomicModule["isRetryableModelFailure"]>
): ReturnType<AtomicModule["isRetryableModelFailure"]> {
	return getAtomic().isRetryableModelFailure(...args);
}

export function isRetryableSameModelFailure(
	...args: Parameters<AtomicModule["isRetryableSameModelFailure"]>
): ReturnType<AtomicModule["isRetryableSameModelFailure"]> {
	return getAtomic().isRetryableSameModelFailure(...args);
}

export function modelFailureMessage(
	...args: Parameters<AtomicModule["modelFailureMessage"]>
): ReturnType<AtomicModule["modelFailureMessage"]> {
	return getAtomic().modelFailureMessage(...args);
}

export function normalizeModelFailureSignal(
	...args: Parameters<AtomicModule["normalizeModelFailureSignal"]>
): ReturnType<AtomicModule["normalizeModelFailureSignal"]> {
	return getAtomic().normalizeModelFailureSignal(...args);
}
