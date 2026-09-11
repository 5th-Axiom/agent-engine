# Implementation guidance

## Scope and references

- Work directly in `/Users/circle/git/agent-engine`. The reference repository `/Users/circle/git/workbuddy-reconstructed` is read-only for implementation work; preserve its unrelated changes.
- Before implementation, read `docs/technical-design.md`, `docs/workbuddy-agent-runtime-usage.md`, and `docs/implementation-plan.md` completely. The design includes two rounds of reliability review; do not use an older summary as the contract.
- Implement the complete first-release scope M0–M3. M4/M5 are expressly deferred candidates, not permission to add distributed scheduling, real replay, or a monitoring product.
- Independently implement the new framework and reference WorkBuddy behaviors. Do not copy reconstructed proprietary modules, prompts, assets, private endpoints or real session data into production code or fixtures.

## Delivery discipline

- The user requested step-by-step implementation until genuinely complete. Continue from a completed milestone to the next while safe, in-scope work remains; do not treat a scaffold, demo or partial mock suite as completion.
- Maintain `docs/implementation-plan.md` and behavior cards with actual evidence, tests and remaining gaps. Never mark a feature complete because its interface exists or tests were skipped.
- Use behavior/contract tests, deterministic fake models and tools, real PostgreSQL integration tests, crash/fault injection, and authorized provider smoke tests. Clearly separate code-confirmed reference behavior from live-verified behavior.
- Keep the public usage scenarios concise and executable. Keep README, exported types, validation schemas and examples synchronized with implemented behavior.
- Only narrow or clarify contracts with documented reasoning. Do not silently remove a reliability requirement to make tests pass.
- If a true external blocker remains after safe alternatives are exhausted, document the exact blocker and ask for the missing input. Do not pretend a blocked smoke test or missing dependency is verified.

## Credentials and external effects

- The user authorized reuse of necessary, user-owned model/API credentials from the reference project for this new local project. Discover and transfer only the minimum needed, on demand.
- Never print credentials, put them in tool call arguments/chat, commit them, embed them in source, or copy an entire credentials directory. Use ignored local files with restrictive permissions and environment/Secret references; examples contain placeholders only.
- Verify `.gitignore` coverage and scan staged content for secrets before any commit. Keep private test output and protocol payloads out of Git.
- Do not treat tokens found in reconstructed vendor bundles as proof of authorization. Do not contact unrelated endpoints, expose private data, execute production refunds/messages, purchase services or publish packages without appropriate user authority.
- Ordinary installation of reputable development dependencies and local test infrastructure is within implementation scope. Avoid destructive actions against unrelated repositories or databases.
