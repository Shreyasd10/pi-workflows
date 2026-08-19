/**
 * Copied from `@bastani/atomic` `stale-context` so catch paths do not import
 * the atomic barrel at module evaluation.
 */
export const STALE_EXTENSION_CONTEXT_MARKER = "extension ctx is stale";

export function isStaleExtensionContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes(STALE_EXTENSION_CONTEXT_MARKER);
}
