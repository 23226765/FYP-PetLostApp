# PetLostApp project agent instructions

## Scope and preservation

- Preserve the existing Vue 3/TypeScript, Express/Mongoose architecture and naming.
- Preserve existing dirty/untracked work. Never reset, discard or overwrite unrelated
  changes. Existing application work and unfinished verification for audit findings
  #10 and #11 remain pending; configuration-only tasks must not resume them.
- New feature development remains paused until the user explicitly resumes it.
- Keep records, images, uploads, runtime environment files and secrets unchanged
  unless the current task specifically authorizes a change. Never expose credentials,
  tokens or environment contents. Never access `sample_mflix` for application work.
- Destructive operations, major migrations, seeds, live cleanup, Atlas writes and
  external provider mutations require explicit, scoped approval. Prefer isolated
  fixtures. Preserve already-approved scope; do not repeatedly seek approval for
  routine in-scope steps. Do not commit or push without explicit authorization.

## Project model defaults

`.codex/config.toml` sets `gpt-6.1-sol` with `medium` reasoning for new project sessions.
`.codex/agents/fyp_architect.toml` defines the specialist `fyp_architect` using
`gpt-6-astra` with `high` reasoning. Inherit existing permissions, sandbox restrictions,
provider, credentials and MCP connections; these files do not broaden access.

Defaults are not proof of the model serving an existing session. Do not claim to
switch the parent model or raise reasoning automatically. Respect runtime settings
and higher-priority instructions. If needed, ask the user to select the intended
model/reasoning or open a new project session rather than silently substituting.

## Task-based routing

Handle routine work directly with the default developer (Sol/medium):

- Styling, interface text and small component changes.
- Ordinary pages, CRUD, API integration and refactoring.
- Straightforward debugging and state-management changes.

Delegate a focused task to `fyp_architect` for:

- Difficult bugs whose root cause remains unclear after reasonable investigation.
- Significant architecture or schema decisions.
- Complicated authentication/session problems.
- Security, privacy and authorization analysis.
- Data-integrity, concurrency and transaction problems.
- High-risk changes and final readiness reviews.

Escalate when reasonable investigation stalls or repeated fixes fail. Multiple
files alone are not a reason to escalate. Keep routine implementation with Sol;
ask the specialist only for the bounded decision, diagnosis, fix or review needed.

## Delegation contract and supported-runtime fallback

1. Before spawning, inspect the available tool schema. Prefer actual named-agent
   invocation **only if supported**; a task/thread name is not an agent selector.
2. Give the specialist the exact question, relevant files/context, approved scope,
   explicit read-only or edit ownership, constraints and expected evidence.
3. Avoid overlapping edits. Wait for the result before making dependent changes.
   Check its evidence and integrate the smallest justified result.
4. If named invocation is unavailable but explicit subagent model selection works,
   read the standalone specialist file and pass its `developer_instructions` as
   task instructions, explicitly selecting `gpt-6-astra` and `high`. Use a fresh
   context when the tool requires that for model overrides; include all necessary
   context. Disclose that the named configuration was manually applied, not
   automatically loaded. Follow the actual tool's parameter names.
5. If neither mechanism exists, report that limitation and request manual specialist
   model selection. Do not simulate delegation or introduce an API-key workaround.
6. Report actual creation/completion tool evidence and model/reasoning metadata
   only where exposed. An agent's self-description is not model-selection proof.

## Verification and handoff

- Separate confirmed defects, suspected risks and missing verification.
- Distinguish mocks, real isolated database tests, provider checks and browser checks.
- Do not run mutating verification beyond the approved scope. Remove only exact
  temporary fixtures where cleanup is explicitly authorized; never broad-delete data.
- Report changed files, checks performed and results, limitations and Git state.
  Never claim unavailable browser/live verification passed.
- Apply existing localization/theme conventions and privacy/authorization policies
  when later application work is explicitly authorized. Do not restart pending
  application work merely because a specialist recommends it.
