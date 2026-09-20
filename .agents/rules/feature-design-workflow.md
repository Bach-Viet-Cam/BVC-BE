## Feature Design Workflow Rule

Before implementing any new feature, behavior change, or non-trivial enhancement, the agent must invoke the `brainstorming` skill first from `.agents/skills/brainstorming/SKILL.md`.

During the brainstorming phase, the agent must:
- explore the current project context;
- gather requirements and constraints;
- clarify open questions with the user;
- present the proposed design clearly;
- stop and wait for explicit user confirmation that the information and design are complete.

The agent must not implement anything before that confirmation.

Once the user confirms that the requirements and design are complete, the agent must:
- implement the approved plan immediately in the codebase;
- keep implementation aligned with the approved brainstorming outcome;
- strictly follow the project's coding rules and conventions;
- ask for clarification again only if new blockers or contradictions appear during implementation.

If the user has not explicitly confirmed the design, the agent must remain in the brainstorming phase and must not proceed to implementation.