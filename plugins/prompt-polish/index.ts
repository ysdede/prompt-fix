import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import { Key } from "@mariozechner/pi-tui";
import {
	canApplyRewrite,
	canUndoRewrite,
	cleanOutput,
	draftFrom,
	MAX_UNDO_ENTRIES,
	MODE_LABELS,
	PROMPTFIX_ROLE,
	userMessageFor,
	systemPromptFor,
	type PolishMode,
} from "./core.ts";

const STATUS_KEY = "promptfix";
const REQUEST_TIMEOUT_MS = 60_000;

interface UndoEntry {
	previous: string;
	rewritten: string;
}

const MODES: Array<{ name: string; mode: PolishMode; shortcut: string; description: string }> = [
	{
		name: "polish",
		mode: "polish",
		shortcut: Key.alt("p"),
		description: "Polish the editor prompt, translating Turkish prose when needed (Alt+P)",
	},
	{
		name: "polish:fix",
		mode: "fix",
		shortcut: Key.alt("e"),
		description: "Fix editor prompt spelling, grammar, and punctuation only (Alt+E)",
	},
	{
		name: "polish:translate",
		mode: "translate",
		shortcut: Key.alt("t"),
		description: "Translate Turkish or mixed prompt prose to technical English (Alt+T)",
	},
];

const UNDO_SHORTCUT = Key.altShift("u");

let undoStack: UndoEntry[] = [];
let rewriting = false;

/**
 * `ctx.models` is part of the OMP host API but is missing from the published
 * `@mariozechner/pi-coding-agent` typings, so the surface is narrowed here.
 */
function resolveRoleModel(ctx: ExtensionContext, role: string): Model<Api> {
	const models = (ctx as unknown as { models?: { resolve(name: string): Model<Api> | undefined } }).models;
	const model = models?.resolve(`@${role}`);
	if (!model) {
		throw new Error(
			`Model role @${role} is not configured. Add it to ~/.omp/agent/config.yml:\n\nmodelRoles:\n  ${role}: <provider>/<model-id>`,
		);
	}
	return model;
}

function textOf(message: AssistantMessage): string {
	if (message.stopReason === "error") {
		throw new Error(message.errorMessage ?? "The model call failed");
	}
	return message.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("");
}

async function requestRewrite(mode: PolishMode, draft: string, ctx: ExtensionContext): Promise<string> {
	const model = resolveRoleModel(ctx, PROMPTFIX_ROLE);
	const apiKey = await ctx.modelRegistry.getApiKey(model);
	if (!apiKey) throw new Error(`No API key available for ${model.provider}/${model.id}`);

	const message = await completeSimple(
		model,
		{
			systemPrompt: systemPromptFor(mode),
			messages: [{ role: "user", content: userMessageFor(draft), timestamp: Date.now() }],
		},
		{
			apiKey,
			temperature: 0.1,
			maxTokens: 4096,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		},
	);

	return textOf(message);
}

function requireEditor(ctx: ExtensionContext): boolean {
	if (!ctx.hasUI) {
		ctx.ui.notify("Prompt polishing requires the interactive editor", "error");
		return false;
	}
	return true;
}

async function execute(mode: PolishMode, args: string, ctx: ExtensionContext): Promise<void> {
	if (!requireEditor(ctx)) return;
	if (rewriting) {
		ctx.ui.notify("A prompt rewrite is already running", "warning");
		return;
	}

	const snapshot = ctx.ui.getEditorText();
	const draft = draftFrom(snapshot, args);
	if (!draft) {
		ctx.ui.notify("Nothing to rewrite: the editor is empty", "info");
		return;
	}

	rewriting = true;
	ctx.ui.setStatus(STATUS_KEY, `Rewriting prompt (${MODE_LABELS[mode]})\u2026`);
	try {
		const rewritten = cleanOutput(await requestRewrite(mode, draft, ctx));
		const current = ctx.ui.getEditorText();

		if (!canApplyRewrite(snapshot, current)) {
			ctx.ui.notify("Draft changed while rewriting; the result was discarded", "warning");
			return;
		}
		if (!rewritten) {
			ctx.ui.notify("The model returned no text", "error");
			return;
		}
		if (rewritten === draft) {
			ctx.ui.notify("No rewrite was needed", "info");
			return;
		}

		ctx.ui.setEditorText(rewritten);
		undoStack.push({ previous: snapshot, rewritten });
		if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();

		ctx.ui.notify(
			`Prompt rewritten (${MODE_LABELS[mode]}). Review it before submitting; ${UNDO_SHORTCUT} or /polish:undo restores the previous draft.`,
			"info",
		);
	} catch (error) {
		const message = error instanceof Error && error.message ? error.message : String(error);
		ctx.ui.notify(`Prompt rewrite failed: ${message}`, "error");
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		rewriting = false;
	}
}

function undo(ctx: ExtensionContext): void {
	if (!requireEditor(ctx)) return;

	const entry = undoStack.at(-1);
	if (!entry) {
		ctx.ui.notify("Nothing to undo", "info");
		return;
	}

	const current = ctx.ui.getEditorText();
	if (!canUndoRewrite(entry.rewritten, current)) {
		ctx.ui.notify(
			"The draft changed since that rewrite; undo left your edits untouched. Restore the rewritten text to undo it.",
			"warning",
		);
		return;
	}

	ctx.ui.setEditorText(entry.previous);
	undoStack.pop();
	ctx.ui.notify("Restored the previous draft", "info");
}

export default function promptPolishExtension(pi: ExtensionAPI) {
	for (const { name, mode, shortcut, description } of MODES) {
		pi.registerCommand(name, {
			description,
			handler: (args, ctx) => execute(mode, args, ctx),
		});
		pi.registerShortcut(shortcut, {
			description,
			handler: (ctx) => execute(mode, "", ctx),
		});
	}

	pi.registerCommand("polish:undo", {
		description: `Undo the last prompt rewrite (${UNDO_SHORTCUT})`,
		handler: (_args, ctx) => undo(ctx),
	});
	pi.registerShortcut(UNDO_SHORTCUT, {
		description: "Undo the last prompt rewrite",
		handler: (ctx) => undo(ctx),
	});
}
