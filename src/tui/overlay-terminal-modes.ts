/**
 * Terminal-mode seams for the workflow graph overlay: autowrap (DECAWM)
 * escape sequences for the local TTY, plus extraction of the isolated host's
 * remote autowrap capability.
 *
 * Fullscreen pi-tui owns mouse reporting and application selection; workflow
 * overlays do not toggle that terminal mode.
 *
 * cross-ref: src/tui/overlay-adapter.ts, src/tui/stage-chat-view-state.ts
 */

import type { PiCustomOverlayFactoryTui } from "../extension/wiring.js";

const TERMINAL_AUTOWRAP_ON = "\x1b[?7h";
const TERMINAL_AUTOWRAP_OFF = "\x1b[?7l";

/** Cursor/VS Code integrated terminals already own mouse selection and copy. */
export function isEmbeddedIdeTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
	const program = (env.TERM_PROGRAM ?? "").toLowerCase();
	return (
		program === "vscode" ||
		program === "cursor" ||
		!!env.VSCODE_INJECTION ||
		!!env.VSCODE_PID ||
		!!env.CURSOR_TRACE_ID
	);
}

/** Always capture the wheel. Native select in a fullscreen overlay copies chrome and can freeze the IDE selection. */
export function defaultStageChatMouseScrollCapture(_env?: NodeJS.ProcessEnv): boolean {
	return true;
}

export interface OverlayTerminalOutput {
	platform: NodeJS.Platform;
	isTTY: boolean | undefined;
	write(data: string): void;
}

export function setTerminalAutowrap(enabled: boolean, output: OverlayTerminalOutput): void {
	if (output.platform !== "win32" || !output.isTTY) return;
	output.write(enabled ? TERMINAL_AUTOWRAP_ON : TERMINAL_AUTOWRAP_OFF);
}

/**
 * Extract the host's remote autowrap capability from the factory TUI — present
 * in isolated interactive mode (drives the real host TTY over the allowlisted
 * engine protocol); `null` for non-isolated hosts and test seams.
 */
export function remoteTerminalControlFrom(
	tui: PiCustomOverlayFactoryTui,
): { setAutowrap(enabled: boolean): void } | null {
	const terminal = tui.terminal;
	if (terminal === undefined || typeof terminal.setAutowrap !== "function") return null;
	return { setAutowrap: terminal.setAutowrap.bind(terminal) };
}
