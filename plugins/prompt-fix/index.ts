import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
// The extension loader rewrites this specifier onto the host's bundled copy.
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import { Key } from "@mariozechner/pi-tui";
import {
	BENCH_SAMPLE,
	benchLine,
	canApplyRewrite,
	canUndoRewrite,
	caveatFor,
	cleanOutput,
	COMMAND_ROOTS,
	draftFrom,
	formatCandidate,
	isLocalBaseUrl,
	MAX_UNDO_ENTRIES,
	MODE_LABELS,
	PROMPTFIX_ROLE,
	rankCandidates,
	userMessageFor,
	systemPromptFor,
	type BenchResult,
	type Candidate,
	type PolishMode,
} from "./core.ts";

const STATUS_KEY = "promptfix";
// Distinct from STATUS_KEY so a bench and a rewrite can never erase each other's line.
const BENCH_STATUS_KEY = "promptfix-bench";
const REQUEST_TIMEOUT_MS = 60_000;

interface UndoEntry {
	previous: string;
	rewritten: string;
}

const MODES: Array<{
	mode: PolishMode;
	suffix?: string;
	shortcut: string;
	description: string;
}> = [
	{
		mode: "polish",
		shortcut: Key.alt("p"),
		description: "Polish the editor prompt, translating Turkish prose when needed (Alt+P)",
	},
	{
		mode: "fix",
		suffix: "fix",
		shortcut: Key.alt("e"),
		description: "Fix editor prompt spelling, grammar, and punctuation only (Alt+E)",
	},
	{
		mode: "translate",
		suffix: "translate",
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

async function rewriteWith(
	model: Model<Api>,
	mode: PolishMode,
	draft: string,
	ctx: ExtensionContext,
): Promise<string> {
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

function requestRewrite(mode: PolishMode, draft: string, ctx: ExtensionContext): Promise<string> {
	return rewriteWith(resolveRoleModel(ctx, PROMPTFIX_ROLE), mode, draft, ctx);
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
		ctx.ui.notify("A rewrite or bench is already running", "warning");
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
		const rewritten = cleanOutput(await requestRewrite(mode, draft, ctx), draft);
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

const BENCH_COUNT = 4;

function registryModels(ctx: ExtensionContext): Model<Api>[] {
	const models = (ctx as unknown as { models?: { list(): Model<Api>[] } }).models;
	return models?.list() ?? [];
}

/** Flattens the priced registry into ranked candidates, keeping each one addressable. */
function rankedFrom(ctx: ExtensionContext): {
	candidates: Candidate[];
	bySelector: Map<string, Model<Api>>;
} {
	const bySelector = new Map<string, Model<Api>>();
	const candidates: Candidate[] = [];
	for (const model of registryModels(ctx)) {
		// Local servers are not hosted models; leave them out of the candidate set.
		if (isLocalBaseUrl(model.baseUrl)) continue;
		const selector = `${model.provider}/${model.id}`;
		bySelector.set(selector, model);
		candidates.push({
			selector,
			inputPerMTok: model.cost?.input ?? 0,
			outputPerMTok: model.cost?.output ?? 0,
			priced: typeof model.cost?.input === "number" && typeof model.cost?.output === "number",
			reasoning: model.reasoning === true,
			contextWindow: model.contextWindow ?? 0,
		});
	}
	return { candidates: rankCandidates(candidates), bySelector };
}

/** The effort suffix a role value may carry, which a registry selector never does. */
const EFFORT_SUFFIX = /:(?:off|minimal|low|medium|high|xhigh|max)$/i;

/**
 * Drops a known effort suffix so a role value can be compared against registry
 * selectors. Only known effort names are stripped, since real ids end in things
 * like `:free`.
 */
function withoutEffort(value: string): string {
	return EFFORT_SUFFIX.test(value) ? value.replace(EFFORT_SUFFIX, "") : value;
}

function currentSelector(pi: ExtensionAPI): string | undefined {
	const roles = lookup("modelRoles")?.get(pi.pi.settings);
	if (typeof roles !== "object" || roles === null) return undefined;
	const value = (roles as Record<string, unknown>)[PROMPTFIX_ROLE];
	if (typeof value !== "string") return undefined;
	return withoutEffort(value);
}

function setSelector(pi: ExtensionAPI, selector: string): void {
	const roles = lookup("modelRoles");
	if (!roles) throw new Error("This omp build exposes no modelRoles setting to write");
	roles.setEntry(pi.pi.settings, PROMPTFIX_ROLE, selector);
}

function listCandidates(candidates: Candidate[], current?: string): string {
	const lines = candidates.map((candidate) => formatCandidate(candidate, current));
	return `${lines.join("\n")}\n\nSet one with /polish:model <provider/id>, or run /polish:bench to compare outputs.`;
}

async function pickModel(pi: ExtensionAPI, args: string, ctx: ExtensionContext): Promise<void> {
	const { candidates, bySelector } = rankedFrom(ctx);
	const current = currentSelector(pi);
	const requested = args.trim();

	if (requested) {
		// The effort suffix is part of the role value but not of the registry
		// selector, so it is stripped for validation and kept when persisted.
		if (!bySelector.has(withoutEffort(requested))) {
			ctx.ui.notify(`${requested} is not an available model`, "error");
			return;
		}
		setSelector(pi, requested);
		notifyRole(ctx, withoutEffort(requested), candidates);
		return;
	}

	if (!ctx.hasUI) {
		ctx.ui.notify(listCandidates(candidates, current), "info");
		return;
	}

	// `select` is positional — an options object throws inside the host — and the
	// host echoes the chosen option string back, so the strings offered here are
	// display labels that have to be mapped back to their selector.
	const labelToSelector = new Map(
		candidates.map((candidate) => [formatCandidate(candidate, current), candidate.selector]),
	);
	let chosen: unknown;
	try {
		chosen = await ctx.ui.select(
			`Model for @${PROMPTFIX_ROLE}${current === undefined ? "" : ` (now ${current})`}`,
			[...labelToSelector.keys()],
		);
	} catch (error) {
		const reason = error instanceof Error && error.message ? error.message : String(error);
		ctx.ui.notify(`Model picker unavailable (${reason}); pick from the list below.`, "warning");
		ctx.ui.notify(listCandidates(candidates, current), "info");
		return;
	}

	// Builds differ on what a successful select resolves to, so accept a display
	// label, something carrying a selector, or a bare selector, and require the
	// result to be a model we actually offered before persisting anything.
	const picked =
		typeof chosen === "string"
			? (labelToSelector.get(chosen) ?? (bySelector.has(chosen) ? chosen : undefined))
			: typeof chosen === "object" && chosen !== null && typeof (chosen as { value?: unknown }).value === "string"
				? ((chosen as { value: string }).value)
				: undefined;
	if (picked === undefined || !bySelector.has(picked)) return;

	setSelector(pi, picked);
	notifyRole(ctx, picked, candidates);
}

/** Sets the role once, whoever chose it, and always carries the caveat with it. */
function notifyRole(ctx: ExtensionContext, selector: string, candidates: Candidate[]): void {
	const chosen = candidates.find((candidate) => candidate.selector === selector);
	const caveat = chosen === undefined ? undefined : caveatFor(chosen);
	ctx.ui.notify(
		caveat === undefined ? `@${PROMPTFIX_ROLE} is now ${selector}` : `@${PROMPTFIX_ROLE} is now ${selector}. ${caveat}`,
		caveat === undefined ? "info" : "warning",
	);
}

async function benchModels(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	const { candidates, bySelector } = rankedFrom(ctx);
	const current = currentSelector(pi);
	const shortlist = candidates.filter((candidate) => candidate.selector !== current).slice(0, BENCH_COUNT);
	if (shortlist.length === 0) {
		ctx.ui.notify("No other ranked models to bench", "info");
		return;
	}
	// A bench spends the same credentials a rewrite uses, so it takes the same
	// single-flight guard rather than racing one. Its status uses its own key.
	if (rewriting) {
		ctx.ui.notify("A rewrite or bench is already running", "warning");
		return;
	}

	rewriting = true;
	ctx.ui.setStatus(BENCH_STATUS_KEY, `Benching ${shortlist.length} models…`);
	const results: BenchResult[] = [];
	try {
		for (const candidate of shortlist) {
			const model = bySelector.get(candidate.selector);
			if (model === undefined) continue;
			const started = Date.now();
			try {
				const output = cleanOutput(await rewriteWith(model, "fix", BENCH_SAMPLE, ctx), BENCH_SAMPLE);
				results.push({ selector: candidate.selector, ms: Date.now() - started, output });
			} catch (error) {
				const reason = error instanceof Error && error.message ? error.message : String(error);
				results.push({ selector: candidate.selector, ms: Date.now() - started, output: "", error: reason });
			}
		}
	} finally {
		ctx.ui.setStatus(BENCH_STATUS_KEY, undefined);
		rewriting = false;
	}

	const header = `Rewrite of "${BENCH_SAMPLE}" by ${shortlist.length} models:`;
	ctx.ui.notify(`${header}\n${results.map(benchLine).join("\n")}`, "info");
}

export default function promptPolishExtension(pi: ExtensionAPI) {
	for (const { mode, suffix, shortcut, description } of MODES) {
		for (const root of COMMAND_ROOTS) {
			pi.registerCommand(suffix ? `${root}:${suffix}` : root, {
				description,
				handler: (args, ctx) => execute(mode, args, ctx),
			});
		}

		pi.registerShortcut(shortcut, {
			description,
			handler: (ctx) => execute(mode, "", ctx),
		});
	}

	for (const root of COMMAND_ROOTS) {
		pi.registerCommand(`${root}:model`, {
			description: "Rank models for @promptfix by price, or set one: /polish:model <provider/id>",
			handler: (args, ctx) => pickModel(pi, args, ctx),
		});
		pi.registerCommand(`${root}:bench`, {
			description: "Rewrite a sample with the top-ranked models and report latency and output",
			handler: (_args, ctx) => benchModels(pi, ctx),
		});
	}

	for (const root of COMMAND_ROOTS) {
		pi.registerCommand(`${root}:undo`, {
			description: `Undo the last prompt rewrite (${UNDO_SHORTCUT})`,
			handler: (_args, ctx) => undo(ctx),
		});
	}

	pi.registerShortcut(UNDO_SHORTCUT, {
		description: "Undo the last prompt rewrite",
		handler: (ctx) => undo(ctx),
	});
}
