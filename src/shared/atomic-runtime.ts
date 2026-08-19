/**
 * Lazy loader for `@bastani/atomic`.
 *
 * The published atomic barrel re-exports the entire agent (TUI, SDK, TypeBox).
 * A static `import` from that barrel makes `pi` walk hundreds of ESM files at
 * extension load. Keep value imports behind `loadAtomic()` so startup stays
 * cheap; call it at the first workflow/TUI gate, then use `getAtomic()`.
 */
export type AtomicModule = typeof import("@bastani/atomic");

let pending: Promise<AtomicModule> | undefined;
let cached: AtomicModule | undefined;

export function loadAtomic(): Promise<AtomicModule> {
	pending ??= import("@bastani/atomic").then((mod) => {
		cached = mod;
		return mod;
	});
	return pending;
}

export function peekAtomic(): AtomicModule | undefined {
	return cached;
}

export function getAtomic(): AtomicModule {
	if (cached === undefined) {
		throw new Error("atomic-workflows: @bastani/atomic is not loaded yet; await loadAtomic() first");
	}
	return cached;
}

/** Uses Atomic's sanitizer after load; otherwise copies `process.env`. */
export function createChildProcessEnvironment(
	overrides?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
	const atomic = peekAtomic();
	if (atomic) return atomic.createChildProcessEnvironment(overrides);
	return { ...process.env, ...overrides };
}

/** Uses Atomic's git env after load; otherwise merges overrides onto `process.env`. */
export function createGitEnvironment(
	overrides?: NodeJS.ProcessEnv,
	baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const atomic = peekAtomic();
	if (atomic) return atomic.createGitEnvironment(overrides, baseEnv);
	return { ...baseEnv, ...overrides };
}
