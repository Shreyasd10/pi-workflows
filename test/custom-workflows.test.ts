import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { discoverStartupWorkflowsSync } from "../src/extension/discovery.js";
import { assertAllWorkflowAssets, assertLockedAssetsForSkills, lockedAsset, lockedAssetEntries, lockedAssetPathsForSkills, verbatimSkill } from "../workflows/shared/asset-loader.js";
import {
	assertPiTaskPrerequisites,
	piTaskExecutionPolicy,
	REQUIRED_PI_TASK_AGENTS,
} from "../workflows/shared/pi-task-policy.js";
import { rpiGraph } from "../workflows/rpi/graph.js";
import { prdOrientedGraph } from "../workflows/prd-oriented/graph.js";
import { resolveDeliveryRunPolicy } from "../workflows/shared/run-policy.js";
import {
	buildVerbatimSkillPrompt,
	DeliveryWorkflowBlocked,
	runVerbatimSkillStage,
	type DeliveryHost,
} from "../workflows/shared/verbatim-skill-runner.js";

describe("custom delivery workflows", () => {
	test("registers RPI and PRD-Oriented in the live bundled startup catalog", () => {
		const result = discoverStartupWorkflowsSync();
		assert.equal(result.registry.names().length, 11);
		const executableBundle = readFileSync(join(process.cwd(), "src/extension/index.bundle.mjs"), "utf8");
		assert.match(executableBundle, /name: "RPI"/);
		assert.match(executableBundle, /name: "PRD-Oriented"/);

		for (const name of ["rpi", "prd-oriented"]) {
			const definition = result.registry.get(name);
			assert.ok(definition);
			assert.deepEqual(Object.keys(definition.inputs), [
				"task",
				"include_research",
				"detailed_plan",
				"iteration_context",
			]);
		}
	});

	test("locks every vendored asset and injects the complete skill exactly once", () => {
		assert.doesNotThrow(() => assertAllWorkflowAssets());
		assert.equal(lockedAssetEntries().length, 73);
		const stage = rpiGraph(false, false)[0]!;
		const skill = verbatimSkill(stage.skill);
		const host = {
			cwd: "/tmp/project",
			task: "Ship the requested change",
			workflow: "rpi",
		} as DeliveryHost;
		const prompt = buildVerbatimSkillPrompt({ host, stage, turn: 1 });
		assert.equal(prompt.split(skill).length - 1, 1);
		assert.match(prompt, /call only the installed pi-task `task` tool/);
		assert.match(prompt, /Agent\(\).*legacy vocabulary/);
	});

	test("runs research-question specialists to completion in one invocation", () => {
		const skill = verbatimSkill("create-research-questions");
		assert.match(skill, /Set `max_turns: 0` on every specialist call/);
		assert.doesNotMatch(skill, /resume that same task/);
	});

	test("runs full-research specialists to completion in one invocation", () => {
		const skill = verbatimSkill("create-research");
		assert.match(skill, /Set `max_turns: 0` on every specialist call/);
		assert.doesNotMatch(skill, /resume that same task/);
	});

	test("host policy disables specialist turn caps", () => {
		const policy = piTaskExecutionPolicy("/tmp/project");
		assert.match(policy, /Set max_turns=0 on every specialist call/);
		assert.doesNotMatch(policy, /max_turns=16|task_id/);
	});

	test("requires plain language in stage prompts without sacrificing quality", () => {
		const host = {
			cwd: "/tmp/project",
			task: "Ship the requested change",
			workflow: "rpi",
		} as DeliveryHost;
		const prompt = buildVerbatimSkillPrompt({ host, stage: rpiGraph(false, false)[0]!, turn: 1 });
		assert.match(prompt, /HUMAN WRITING — WRITE LIKE A TEAMMATE/);
		assert.match(prompt, /Human meaning first, then the machine name/);
		assert.match(prompt, /Plain words, not less content/);
	});

	test("builds first-class graphs with reviewable optional paths", () => {
		assert.deepEqual(rpiGraph(false, false).map((stage) => stage.skill), [
			"create-design-discussion",
			"create-structure-outline",
			"implement-outline",
		]);
		assert.deepEqual(prdOrientedGraph(true, true).map((stage) => stage.skill), [
			"create-research-questions",
			"create-research",
			"create-prd",
			"create-technical-design",
			"create-structure-outline",
			"create-plan",
			"implement-plan",
		]);
		assert.deepEqual(prdOrientedGraph(false, false).map((stage) => stage.skill), [
			"create-prd",
			"create-technical-design",
			"create-structure-outline",
			"implement-outline",
		]);
		assert.equal(prdOrientedGraph(false, false).find((stage) => stage.id === "product-requirements")?.maxTurns, 64);
		assert.equal(prdOrientedGraph(false, false).find((stage) => stage.id === "technical-design")?.maxTurns, 96);
		assert.equal(prdOrientedGraph(false, false).find((stage) => stage.id === "product-requirements")?.interview, true);
		assert.equal(prdOrientedGraph(false, false).find((stage) => stage.id === "technical-design")?.interview, true);
	});

	test("vendored skills use human writing instead of a junior-dev glossary", () => {
		const rootNames = [
			"create-design-discussion",
			"create-plan",
			"create-research",
			"create-research-questions",
			"create-structure-outline",
			"create-technical-design",
			"implement-outline",
			"implement-plan",
			"teach-me",
		];
		for (const name of rootNames) {
			const skill = verbatimSkill(name);
			assert.match(skill, /## Human writing/);
			assert.match(skill, /Human meaning first, then the machine name/);
			assert.doesNotMatch(skill, /Always assume the reader is a junior developer/);
		}
		assert.match(verbatimSkill("create-prd"), /## PRD voice/);
	});

	test("PRD skill opens with a Problem to Solve question and does not auto-fill the solution", () => {
		const skill = verbatimSkill("create-prd");
		assert.match(skill, /does this \*\*Problem to Solve\*\* sound right\?/);
		assert.match(skill, /Stop after that question/);
		assert.match(skill, /Do not invent answers from research or tickets/);
		assert.match(skill, /Exactly one question per message/);
		assert.match(skill, /Never write a decision log/);
		assert.match(skill, /Walk the user-visible journey/);
		assert.match(skill, /one visual state per file|dedicated mockup|Keep each mockup focused on \*\*one\*\* decision/);
		assert.match(skill, /Alternative Solutions Considered/);
		assert.match(skill, /Deferred to TDD/);
		assert.match(skill, /PRD voice/);
		assert.match(skill, /People first/);
		assert.match(skill, /Human meaning first/);
	});

	test("TDD skill opens with a design-boundary question and does not auto-fill System Design", () => {
		const skill = verbatimSkill("create-technical-design");
		assert.match(skill, /complete cross-repository journey/);
		assert.match(skill, /cwd is not the design boundary/);
		assert.match(skill, /Stop after that question/);
		assert.match(skill, /Do not invent answers from research or tickets/);
		assert.match(skill, /Walk the architecture\. Do not batch it/);
		assert.match(skill, /CREATE TABLE/);
		assert.match(skill, /Fails-closed pipeline order/);
		assert.match(skill, /409 Conflict/);
		assert.match(skill, /HMAC with a server secret/);
		assert.match(skill, /Never write a decision log/);
	});

	test("TDD interview prompt requires a design-boundary question before stage_complete", () => {
		const host = {
			cwd: "/tmp/project",
			task: "Ship the requested change",
			workflow: "prd-oriented",
		} as DeliveryHost;
		const stage = prdOrientedGraph(false, false).find((candidate) => candidate.id === "technical-design")!;
		const prompt = buildVerbatimSkillPrompt({ host, stage, turn: 1 });
		assert.match(prompt, /INTERVIEW STAGE RULES/);
		assert.match(prompt, /Returning kind=stage_complete is a contract violation/);
		assert.match(prompt, /this-repo vs end-to-end/);
		assert.match(prompt, /cwd is not the design boundary/);
		assert.match(prompt, /real DDL/);
		assert.match(prompt, /409 Conflict/);
		assert.match(prompt, /TDD VOICE — WRITE LIKE AN ENGINEER EXPLAINING THE CHANGE/);
		assert.match(prompt, /complete cross-repository journey/);
	});

	test("interview stages require kind=question before stage_complete", () => {
		const host = {
			cwd: "/tmp/project",
			task: "Ship the requested change",
			workflow: "prd-oriented",
		} as DeliveryHost;
		const stage = prdOrientedGraph(false, false).find((candidate) => candidate.id === "product-requirements")!;
		const prompt = buildVerbatimSkillPrompt({ host, stage, turn: 1 });
		assert.match(prompt, /INTERVIEW STAGE RULES/);
		assert.match(prompt, /Returning kind=stage_complete is a contract violation/);
		assert.match(prompt, /does this \*\*Problem to Solve\*\* sound right\?/);
		assert.match(prompt, /not a Decided-D1 log/);
		assert.match(prompt, /dedicated mockup each/);
		assert.match(prompt, /PRD VOICE — WRITE LIKE A PERSON EXPLAINING THE PRODUCT/);
		assert.match(prompt, /Human meaning first, then the machine name/);
		assert.doesNotMatch(prompt.split("IMMUTABLE VERBATIM SKILL PAYLOAD — BEGIN")[0]!, /PLAIN LANGUAGE — ARTIFACTS MUST READ EASILY/);
	});

	test("PRD-Oriented integrity-checks create-prd, not create-design-discussion", () => {
		const prdSkills = prdOrientedGraph(false, false).map((stage) => stage.skill);
		const paths = lockedAssetPathsForSkills(prdSkills);
		assert.ok(paths.includes("skills/create-prd/SKILL.md"));
		assert.ok(paths.includes("skills/create-technical-design/SKILL.md"));
		assert.equal(
			paths.some((path) => path.startsWith("skills/create-design-discussion/")),
			false,
		);
		assert.doesNotThrow(() => assertLockedAssetsForSkills(prdSkills));
	});

	test("propagates approved artifacts through complete RPI and PRD-Oriented graphs", async () => {
		for (const [workflow, stages] of [
			["rpi", rpiGraph(true, true)],
			["prd-oriented", prdOrientedGraph(true, true)],
		] as const) {
			const root = mkdtempSync(join(tmpdir(), `${workflow}-graph-`));
			const prompts: Array<{ stageIndex: number; prompt: string }> = [];
			const approvedArtifacts: string[] = [];
			const host = {
				ctx: {
					task: async (name: string, options: Record<string, unknown>) => {
						const stageId = name.split(":", 1)[0]!;
						const stageIndex = stages.findIndex((stage) => stage.id === stageId);
						const relativePath = `docs/workflow-test/${stageId}.md`;
						mkdirSync(join(root, "docs/workflow-test"), { recursive: true });
						writeFileSync(join(root, relativePath), `${stageId}\n`);
						prompts.push({ stageIndex, prompt: String(options.prompt) });
						const interviewTurn = stages[stageIndex]?.interview === true && name.endsWith(":turn-1");
						return {
							structured: interviewTurn
								? {
										kind: "question",
										message: "Does this Problem to Solve sound right?",
										question_id: `${stageId}:q1`,
										artifact_paths: [relativePath],
										diagnostics: [],
									}
								: {
										kind: "stage_complete",
										message: `${stageId} ready`,
										artifact_paths: [relativePath],
										diagnostics: [],
									},
							sessionFile: `/tmp/${workflow}-${stageId}.jsonl`,
						};
					},
					ui: { input: async () => "Looks right", confirm: async () => true },
				},
				cwd: root,
				task: "Deliver the workflow task",
				workflow,
				iterationContext: "fresh",
				artifactRoot: root,
				completedStages: [],
				approvedArtifacts,
			} as unknown as DeliveryHost;

			for (const stage of stages) await runVerbatimSkillStage(host, stage);

			assert.deepEqual(host.completedStages, stages.map((stage) => stage.skill));
			assert.equal(host.approvedArtifacts.length, stages.length);
			for (const entry of prompts) {
				for (const upstream of host.approvedArtifacts.slice(0, entry.stageIndex)) {
					assert.match(entry.prompt, new RegExp(upstream));
				}
			}
		}
	});

	test("blocks interview stages that skip the human and complete immediately", async () => {
		const root = mkdtempSync(join(tmpdir(), "prd-skip-interview-"));
		const host = {
			ctx: {
				task: async () => ({
					structured: {
						kind: "stage_complete",
						message: "PRD ready",
						artifact_paths: [],
						diagnostics: [],
					},
					sessionFile: "/tmp/prd-skip.jsonl",
				}),
				ui: { input: async () => "ok", confirm: async () => true },
			},
			cwd: root,
			task: "Write the PRD",
			workflow: "prd-oriented",
			iterationContext: "fresh",
			artifactRoot: root,
			completedStages: [],
			approvedArtifacts: [],
		} as unknown as DeliveryHost;
		const stage = prdOrientedGraph(false, false).find((candidate) => candidate.id === "product-requirements")!;
		await assert.rejects(
			runVerbatimSkillStage(host, stage),
			(error: unknown) =>
				error instanceof DeliveryWorkflowBlocked && /skipped the required human interview/.test(error.message),
		);
	});

	test("pauses an interview stage on the first question then continues after the answer", async () => {
		const root = mkdtempSync(join(tmpdir(), "prd-interview-"));
		const questions: string[] = [];
		let call = 0;
		const host = {
			ctx: {
				task: async () => {
					call += 1;
					return {
						structured:
							call === 1
								? {
										kind: "question",
										message: "Does this Problem to Solve sound right?",
										question_id: "prd:problem",
										artifact_paths: [],
										diagnostics: [],
									}
								: {
										kind: "stage_complete",
										message: "PRD ready",
										artifact_paths: [],
										diagnostics: [],
									},
						sessionFile: `/tmp/prd-interview-${call}.jsonl`,
					};
				},
				ui: {
					input: async (message: string) => {
						questions.push(message);
						return "Yes, that problem statement is right.";
					},
					confirm: async () => true,
				},
			},
			cwd: root,
			task: "Write the PRD",
			workflow: "prd-oriented",
			iterationContext: "fresh",
			artifactRoot: root,
			completedStages: [],
			approvedArtifacts: [],
		} as unknown as DeliveryHost;
		const stage = prdOrientedGraph(false, false).find((candidate) => candidate.id === "product-requirements")!;
		await runVerbatimSkillStage(host, stage);
		assert.deepEqual(questions, ["Does this Problem to Solve sound right?"]);
		assert.equal(call, 2);
		assert.deepEqual(host.completedStages, ["create-prd"]);
	});

	test("fails closed unless pi-task and exact named-agent contracts are installed", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-task-prereq-"));
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: ["pi-task"] }));
		mkdirSync(join(agentDir, "agents"));
		assert.throws(() => assertPiTaskPrerequisites(agentDir), /named-agent prerequisite missing/);
		for (const name of REQUIRED_PI_TASK_AGENTS) {
			writeFileSync(join(agentDir, "agents", `${name}.md`), lockedAsset(`agents/${name}.md`));
		}
		assert.doesNotThrow(() => assertPiTaskPrerequisites(agentDir));
		assert.match(piTaskExecutionPolicy("/tmp/project"), /background=false/);
	});

	test("uses fresh physical sessions and a validated handoff across human turns", async () => {
		const root = mkdtempSync(join(tmpdir(), "verbatim-stage-"));
		const taskOptions: Array<Record<string, unknown>> = [];
		let call = 0;
		const ctx = {
			task: async (_name: string, options: Record<string, unknown>) => {
				taskOptions.push(options);
				call += 1;
				return call === 1
					? {
							structured: {
								kind: "question",
								message: "Which option should we use?",
								question_id: "design-1",
								artifact_paths: [],
								diagnostics: [],
							},
							sessionFile: "/tmp/session-1.jsonl",
						}
					: {
							structured: {
								kind: "stage_complete",
								message: "Design is ready.",
								artifact_paths: [],
								diagnostics: [],
							},
							sessionFile: "/tmp/session-2.jsonl",
						};
			},
			ui: {
				input: async () => "Use option A",
				confirm: async () => true,
			},
		};
		const host = {
			ctx,
			cwd: root,
			task: "Design the change",
			workflow: "rpi",
			iterationContext: "fresh",
			artifactRoot: root,
			completedStages: [],
			approvedArtifacts: [],
		} as unknown as DeliveryHost;

		await runVerbatimSkillStage(host, rpiGraph(false, false)[0]!);

		assert.equal(taskOptions.length, 2);
		assert.equal(taskOptions[0]!.context, "fresh");
		assert.equal(taskOptions[1]!.context, "fresh");
		assert.equal("forkFromSessionFile" in taskOptions[1]!, false);
		assert.match(String(taskOptions[1]!.prompt), /Use option A/);
		assert.match(String(taskOptions[1]!.prompt), /handoff-latest\.json/);
		assert.deepEqual(host.completedStages, ["create-design-discussion"]);
		const approvedHandoff = JSON.parse(
			readFileSync(join(root, "skill-stages/design-discussion/handoff-latest.json"), "utf8"),
		) as { validation: { approved: boolean } };
		assert.equal(approvedHandoff.validation.approved, true);
	});

	test("continues the same stage when a question omits its stable id", async () => {
		const root = mkdtempSync(join(tmpdir(), "question-fallback-"));
		let call = 0;
		const host = {
			ctx: {
				task: async () => {
					call += 1;
					return {
						structured: {
							kind: call === 1 ? "question" : "stage_complete",
							message: call === 1 ? "Which option should we use?" : "Design is ready.",
							artifact_paths: [],
							diagnostics: [],
						},
						sessionFile: `/tmp/question-fallback-${call}.jsonl`,
					};
				},
				ui: { input: async () => "Use option A", confirm: async () => true },
			},
			cwd: root,
			task: "Design the change",
			workflow: "rpi",
			iterationContext: "fresh",
			artifactRoot: root,
			completedStages: [],
			approvedArtifacts: [],
		} as unknown as DeliveryHost;

		await runVerbatimSkillStage(host, rpiGraph(false, false)[0]!);

		assert.equal(call, 2);
		assert.deepEqual(host.completedStages, ["create-design-discussion"]);
		const receipt = JSON.parse(
			readFileSync(join(root, "skill-stages/design-discussion/turn-1.json"), "utf8"),
		) as { outcome: { question_id?: string } };
		assert.equal(receipt.outcome.question_id, "design-discussion:question:1");
	});

	test("fork rollback continues only the matching logical-stage session", async () => {
		const root = mkdtempSync(join(tmpdir(), "forked-stage-"));
		const taskOptions: Array<Record<string, unknown>> = [];
		let call = 0;
		const host = {
			ctx: {
				task: async (_name: string, options: Record<string, unknown>) => {
					taskOptions.push(options);
					call += 1;
					return {
						structured: {
							kind: call === 1 ? "question" : "stage_complete",
							message: call === 1 ? "Continue?" : "Ready",
							question_id: call === 1 ? "continue-1" : undefined,
							artifact_paths: [],
							diagnostics: [],
						},
						sessionFile: `/tmp/fork-${call}.jsonl`,
					};
				},
				ui: { input: async () => "Continue", confirm: async () => true },
			},
			cwd: root,
			task: "Design the change",
			workflow: "rpi",
			iterationContext: "fork",
			artifactRoot: root,
			completedStages: [],
			approvedArtifacts: [],
		} as unknown as DeliveryHost;

		await runVerbatimSkillStage(host, rpiGraph(false, false)[0]!);

		assert.equal(taskOptions[0]!.context, "fresh");
		assert.equal(taskOptions[1]!.context, "fork");
		assert.equal(taskOptions[1]!.forkFromSessionFile, "/tmp/fork-1.jsonl");
	});

	test("persists the delivery graph policy and rejects resume drift", async () => {
		const artifactRoot = mkdtempSync(join(tmpdir(), "delivery-policy-"));
		const base = {
			artifactRoot,
			workflow: "rpi" as const,
			iterationContext: "fresh" as const,
			cwd: "/tmp/project",
			maxSkillTurns: 32,
			maxActiveAnswerBytes: 32 * 1024,
		};
		await resolveDeliveryRunPolicy(base);
		await assert.rejects(
			resolveDeliveryRunPolicy({ ...base, iterationContext: "fork" }),
			/run policy mismatch/i,
		);
	});
});
