/**
 * pi-subagent-toolbudget
 *
 * A companion extension for pi-subagents that caps how many tool calls a spawned
 * sub-agent may make. It is a NO-OP in the top-level agent and in any non-subagent pi
 * session — it activates only inside a sub-agent process, which pi-subagents marks with
 * the `PI_SUBAGENT_CHILD=1` environment variable in each child.
 *
 * Why: reviewers (and other sub-agents) occasionally "browse the tree" — dozens to
 * hundreds of read/grep calls — until they overflow their context window and die
 * (exit=1) having produced nothing. A hard cap forces the model to stop and write a
 * final report from what it has already gathered, turning a silent failure into a
 * usable (if partial) result.
 *
 * Configuration comes from the LAUNCH WIRING, never the environment. Put a directive
 * anywhere in the sub-agent's task text:
 *
 *     [[toolbudget: soft=40 hard=60 block=read,grep,find,ls]]
 *
 * - `soft` — after this many calls, each tool result is annotated with a "wrap up now"
 *   nudge (the model may still call tools).
 * - `hard` — every further blocked tool call is stopped; the model must finalize.
 * - `block` — comma-separated tool names blocked over budget (default: read,grep,find,ls).
 *   Use `block=*` to block every tool (strict; see the deadlock note below).
 *
 * Any key may be omitted. With no directive, the built-in defaults below apply.
 *
 * By default only the read/search tools that cause runaway "browse the tree" behaviour are
 * blocked over budget; report/output tools (and plain-text final answers) are left open so
 * the agent can still deliver its final report when told to stop. `block=*` overrides that
 * and blocks everything — only use it for sub-agents whose final report is plain text, or
 * you risk blocking the very tool the agent needs to deliver its report.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_SOFT = 35;
const DEFAULT_HARD = 60;

// The investigation tools whose runaway use overflows context. Blocked past `hard` by
// default; anything else (a completion/output/messaging tool, or `bash`, or an edit the
// agent needs to finish) stays available so the final report can always be delivered.
// Override per task with `block=...` (or `block=*` for all tools).
const DEFAULT_OVER_BUDGET_BLOCK = ["read", "grep", "find", "ls"];

const DIRECTIVE = /\[\[\s*toolbudget:\s*([^\]]*)\]\]/i;

function parseKey(body: string, key: string): number | undefined {
  const m = body.match(new RegExp(`${key}\\s*=\\s*(\\d+)`, "i"));
  return m ? parseInt(m[1], 10) : undefined;
}

export default function toolbudget(pi: ExtensionAPI): void {
  // Activate only inside a spawned sub-agent. pi-subagents sets PI_SUBAGENT_CHILD=1 in
  // every child process; the top-level agent and ordinary pi sessions do not have it.
  if (process.env.PI_SUBAGENT_CHILD !== "1") return;

  let soft = DEFAULT_SOFT;
  let hard = DEFAULT_HARD;
  let blocked = new Set(DEFAULT_OVER_BUDGET_BLOCK);
  let blockAll = false;
  let count = 0;

  // Read the per-task budget from the task prompt (the launch wiring).
  pi.on("before_agent_start", async (event) => {
    const m = String(event?.prompt ?? "").match(DIRECTIVE);
    if (!m) return;
    const s = parseKey(m[1], "soft");
    const h = parseKey(m[1], "hard");
    if (s !== undefined) soft = s;
    if (h !== undefined) hard = h;
    if (hard < soft) hard = soft; // keep the hard stop at or past the soft nudge

    const bm = m[1].match(/block\s*=\s*([a-z0-9_,*\-]+)/i);
    if (bm) {
      const list = bm[1].toLowerCase();
      blockAll = list.split(",").map((t) => t.trim()).includes("*");
      if (!blockAll) blocked = new Set(list.split(",").map((t) => t.trim()).filter(Boolean));
    }
  });

  // Hard cap: once the budget is spent, block the configured tools. By default only
  // read/search tools, so report/output/messaging tools stay open and the model can
  // still deliver its final report (unless `block=*` was set).
  pi.on("tool_call", async (event) => {
    if (count >= hard && (blockAll || blocked.has(String(event?.toolName ?? "")))) {
      return {
        block: true,
        reason:
          `Tool budget exhausted (${count}/${hard} calls). Stop and write your final report ` +
          `NOW from what you have already gathered${blockAll ? "" : " — reporting and output tools remain available"}.`,
      };
    }
    count++;
    return undefined;
  });

  // Soft nudge: past the soft cap, remind after each result to start wrapping up.
  pi.on("tool_result", async (event) => {
    if (count < soft || !Array.isArray(event?.content)) return undefined;
    event.content.push({
      type: "text",
      text:
        `\n[toolbudget] ${count} tool calls used (soft ${soft}); ` +
        `${Math.max(0, hard - count)} left before a hard stop — start writing your final report.`,
    });
    return { content: event.content, details: event.details, isError: event.isError };
  });
}
