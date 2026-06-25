# Skills Manager

Skills Manager is the context for maintaining reusable AI agent skills and deciding where those skills are available. It distinguishes the user's central collection of skills from the agent and workspace locations where skills are applied.

## Language

**Skill**:
A reusable capability package that an AI agent can discover and use.
_Avoid_: Plugin, extension

**Skill Library**:
The user's central collection of managed skills. A skill can belong to the library without being available to any agent.
_Avoid_: Store, marketplace, global folder

**Skill Source**:
The place a skill was imported from or can be refreshed from, such as a local folder, Git repository, archive, or skill marketplace.
_Avoid_: Origin

**Tool**:
A configured AI coding agent target whose skills folder can receive managed skills. When user-facing text says "agent", it refers to the same target.
_Avoid_: Integration

**Preset**:
A named reusable group of skills that can be applied to a workspace or set of tools.
_Avoid_: Scenario

**Global Workspace**:
The per-tool skills area outside any single project. It exists because a Tool has a global skills location; it is not a user-registered workspace.
_Avoid_: Library, central repository

**Project Workspace**:
A project-local skills area that applies only within one project. It is a user-registered workspace.
_Avoid_: Global workspace

**Linked Workspace**:
An external skills root managed as its own workspace rather than as a project-local or global workspace. It is a user-registered workspace.
_Avoid_: Project workspace

**Install**:
The act of adding a skill to the Skill Library from a Skill Source. Installing a skill does not necessarily make it available to any tool.
_Avoid_: Sync

**Sync**:
The act of making library skills available to tools or workspaces. Sync-managed Tool targets are distinct from ordinary Skill copies that live in a Project Workspace or Linked Workspace.
_Avoid_: Install

**Adopt**:
The act of bringing a skill that already exists in a tool's skills folder under Skill Library management.
_Avoid_: Install, sync
