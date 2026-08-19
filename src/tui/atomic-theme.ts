/**
 * Stock `pi` never calls Atomic's `initTheme()`. Stage chat embeds Atomic
 * components (`UsageMeterComponent`, working status, message chrome) that read
 * the global theme proxy and throw "Theme not initialized" otherwise.
 */
import { loadAtomic } from "../shared/atomic-runtime.js";

let ensured = false;

/** Idempotent: first call publishes a live Atomic theme; later calls no-op. */
export async function ensureAtomicThemeInitialized(themeName?: string): Promise<void> {
	if (ensured) return;
	const { initTheme } = await loadAtomic();
	initTheme(themeName);
	ensured = true;
}
