# Text-Only Pull Request Guidelines

To keep the repository history lean and auditable, ensure that every pull request includes only text-based assets unless binary files are absolutely required.

1. Verify your diff with `git diff --stat` and `git diff --name-only` before committing.
2. Exclude generated binaries, archives, and media assets from staging.
3. Prefer Markdown, TypeScript, or configuration changes when documenting behavior.
4. Use `.gitignore` entries to prevent accidental inclusion of binary artifacts.
5. Document any removed binaries in the PR description for clarity.
