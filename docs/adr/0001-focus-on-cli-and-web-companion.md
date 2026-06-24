# Focus on the CLI and Web Companion

The repository originally carried three product surfaces: desktop app, CLI, and Web Companion. We will keep the CLI external contract and the Web Companion as the supported surfaces, remove the desktop/Tauri surface, and make the Rust core serve CLI/Web needs rather than a desktop application. This is a deliberate choice over a shallow front-end deletion because keeping desktop framework dependencies would preserve the coupling and ambiguity the cleanup is meant to remove.

## Considered Options

- Keep only the existing CLI behavior and delete all browser UI. Rejected because the Web Companion is part of the intended future development surface.
- Delete the root desktop UI but keep the Tauri Rust shell. Rejected because the repository would still be coupled to desktop-only commands, tray behavior, window handling, and Tauri build requirements.
- Rewrite the Web Companion immediately. Rejected because the current Web client already has its own adapter and can remain the React UI source of truth while CLI cleanup proceeds.

## Consequences

- The CLI command contract remains stable for users, scripts, and the Web Companion.
- The Web Companion continues to use the CLI JSON interface as its backend contract.
- The Web client becomes the retained React UI surface after the desktop app is removed.
- Cargo becomes the primary Rust build path; npm CLI scripts remain only as compatibility wrappers.
