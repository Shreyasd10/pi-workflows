import { getAtomic } from "../shared/atomic-runtime.js";

export function nextEventLoopTurn(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

export function runWorkflowDefinitionCallback<T>(
	name: string,
	runId: string,
	callback: () => T | Promise<T>,
): Promise<T> {
	return getAtomic().runCallback({ kind: "workflow.run", name, runId }, callback);
}
