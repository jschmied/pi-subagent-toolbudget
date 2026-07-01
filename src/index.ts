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
 *     [[toolbudget: soft=40 hard=60]]
 *
 * - `soft` — after this many calls, each tool result is annotated with a "wrap up now"
 *   nudge (the model may still call tools).
 * - `hard` — every further read/search call is blocked; the model must finalize.
 *
 * Either key may be omitted. With no directive, the built-in defaults below apply.
 *
 * Only the read/search tools that cause runaway "browse the tree" behaviour are blocked
 * over budget. Report/output tools (and plain-text final answers) are always left open,
 * so the agent can still deliver its final report when told to stop.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_SOFT = 35;
const DEFAULT_HARD = 60;

// The investigation tools whose runaway use overflows context. Only these are blocked
// past `hard`; anything else (a completion/output/messaging tool, or `bash`, or an edit
// the agent needs to finish) stays available so the final report can always be delivered.
const OVER_BUDGET_BLOCK = new Set(["read", "grep", "find", "ls"]);

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
  });

  // Hard cap: once the budget is spent, block further read/search calls only. Report/
  // output/messaging tools stay open so the model can still deliver its final report.
  pi.on("tool_call", async (event) => {
    if (count >= hard && OVER_BUDGET_BLOCK.has(String(event?.toolName ?? ""))) {
      return {
        block: true,
        reason:
          `Tool budget exhausted (${count}/${hard} calls). Stop reading and searching and ` +
          `write your final report NOW from what you have already gathered — reporting and ` +
          `output tools remain available.`,
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
