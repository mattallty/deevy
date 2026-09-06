/**
 * What a Run moved on the remote.
 *
 * An Agent pushes where it likes (ADR-0019), so what the runtime owes a Human
 * is not a refusal but an account: which refs changed, from what to what, and
 * whether the new commit keeps the old one in its history. That is the answer
 * to ADR-0014's second question — what a Human sees when an agent reaches
 * further than intended — and it is the whole of what replaces the denial.
 */
export interface MovedRef {
  ref: string;
  /** The commit the ref pointed at before the Run, or null when it did not exist. */
  from: string | null;
  /** The commit it points at now, or null when the Run deleted it. */
  to: string | null;
  /** Whether history was rewritten: the old commit is not in the new one's. */
  rewritten: boolean;
}

export interface MovedRefsOptions {
  before: ReadonlyMap<string, string>;
  after: ReadonlyMap<string, string>;
  /** Whether the first commit is in the second's history. Git answers this. */
  isAncestor(older: string, newer: string): Promise<boolean>;
}

export async function movedRefs(options: MovedRefsOptions): Promise<MovedRef[]> {
  const moved: MovedRef[] = [];
  for (const [ref, to] of options.after) {
    const from = options.before.get(ref) ?? null;
    if (from === to) continue;
    // A ref that existed and now points somewhere its old commit is not in the
    // history of: the work that was there is not there any more.
    const rewritten = from !== null && !(await options.isAncestor(from, to));
    moved.push({ ref, from, to, rewritten });
  }
  for (const [ref, from] of options.before) {
    // A ref that is gone: nothing was moved forward, and whatever was on it is
    // not on the remote any more.
    if (!options.after.has(ref)) moved.push({ ref, from, to: null, rewritten: true });
  }
  return moved;
}

/**
 * The refs a remote has, as `git ls-remote` prints them: one commit, a tab,
 * one ref, per line.
 *
 * `HEAD` is left out because it is whatever the default branch points at and
 * moves with it, and a peeled tag (`^{}`) is the commit inside an annotated
 * one rather than a ref of its own — counting either would report a move
 * nobody made.
 */
export function refsFrom(printed: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of printed.split("\n")) {
    const [commit, ref] = line.split("\t");
    if (!commit || !ref) continue;
    if (ref === "HEAD" || ref.endsWith("^{}")) continue;
    refs.set(ref, commit);
  }
  return refs;
}

/**
 * One moved ref, as the sentence that goes in the Run's feed.
 *
 * Written for the Human who opens the Issue rather than for a log: the verb
 * says what happened, the short commits say where from and where to, and a
 * rewrite says so in its own words, because that is the one a reviewer has to
 * act on.
 */
export function sentenceFor(moved: MovedRef): string {
  const short = (commit: string) => commit.slice(0, 7);
  if (moved.to === null) {
    return `Deleted ${moved.ref}, which was at ${short(moved.from ?? "")}`;
  }
  if (moved.from === null) return `Pushed ${moved.ref} at ${short(moved.to)}`;
  const move = `${moved.ref} from ${short(moved.from)} to ${short(moved.to)}`;
  return moved.rewritten ? `Rewrote ${move}, which is not a fast-forward` : `Moved ${move}`;
}

/**
 * The branches a Run put on the remote itself, base branch excluded.
 *
 * What the supervisor does with a Run's work depends on whether the session
 * already did it: a session that pushed has delivered, and the supervisor's
 * job is to attach what is there rather than to push a second branch beside it
 * (docs/plans/agent-owns-git.md).
 */
export function branchesPushed(
  moved: ReadonlyArray<MovedRef>,
  baseBranch: string,
): Array<{ branch: string; commit: string }> {
  const base = `refs/heads/${baseBranch}`;
  return moved.flatMap((ref) =>
    ref.to !== null && ref.ref.startsWith("refs/heads/") && ref.ref !== base
      ? [{ branch: ref.ref.slice("refs/heads/".length), commit: ref.to }]
      : [],
  );
}
