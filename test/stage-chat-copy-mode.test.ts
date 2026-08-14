import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	defaultStageChatMouseScrollCapture,
	isEmbeddedIdeTerminal,
} from "../src/tui/overlay-terminal-modes.js";

describe("stage chat copy mode defaults", () => {
	test("Cursor and VS Code start in copy mode so selection is not captured", () => {
		assert.equal(isEmbeddedIdeTerminal({ CURSOR_TRACE_ID: "1" }), true);
		assert.equal(isEmbeddedIdeTerminal({ VSCODE_PID: "1" }), true);
		assert.equal(isEmbeddedIdeTerminal({ TERM_PROGRAM: "vscode" }), true);
		assert.equal(defaultStageChatMouseScrollCapture({ CURSOR_TRACE_ID: "1" }), false);
	});

	test("native TTYs still capture the wheel for in-pane scroll", () => {
		assert.equal(isEmbeddedIdeTerminal({ TERM_PROGRAM: "iTerm.app" }), false);
		assert.equal(defaultStageChatMouseScrollCapture({ TERM_PROGRAM: "iTerm.app" }), true);
	});
});
