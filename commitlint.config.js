/**
 * Conventional commits, with the two rules that would reject this repository's
 * own history switched off (docs/plans/commits-and-changelogs.md).
 *
 * Merges here are squashed, so the message that lands on `main` is the pull
 * request title. The `.husky/commit-msg` hook checks what a person writes
 * locally; the `commit-message` job in CI checks the title, and that is the one
 * that decides what the log looks like. Both read this file.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // `config-conventional` wraps both at 100. Commit bodies here are unwrapped
    // paragraphs — one in recent history is a single 700-character line — so the
    // default rejects the way this project has always written them. The subject
    // is what the convention is for; the body stays prose.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    // No `scope-enum` on purpose. A scope stays optional and free-form: the
    // changelog is grouped by the packages a changeset names, not by what a
    // subject line claims, so a list here would be a second vocabulary to keep
    // in step with the workspace for no reader's benefit.
  },
};
