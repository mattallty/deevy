# Two Members in one Document at the same time

A plan, 2026-09-12. The Documents pane now edits in place — the view is the editor and leaving the text
writes a version. That makes the question of what happens when two Members are in the same Document at the
same time a real one rather than a theoretical one, and it is more likely here than in most tools: an Agent
does not wait for a Human to finish typing before it writes the spec it was asked for.

This is the only item of that batch not built. What shipped instead is the honest interim, below; what it
would take to do the real thing is the rest of the document, so the cost is on the table before anybody pays
it.

## What ships today: a save is refused rather than silently winning

`documents.write` takes an optional `baseVersion` — the version the text on screen was read from. The
handler compares it with the Document's `currentVersion` and throws `CONFLICT` when they differ, so:

- Ada opens the spec at v2 and starts typing.
- Planner writes v3 from a Run.
- Ada's editor blurs and tries to save on top of v2. The server refuses; the pane says so and keeps her text.

Nobody's words are lost, and the loser of the race is told. What it does **not** do is merge, or show Ada
that Planner is in the Document while she is typing, or let the two of them write at once. It is a lock with
a late and unhelpful error message, and it is a floor, not an answer.

## What "simultaneous" actually requires

Three separable things, in the order they pay off:

1. **Presence** — who else has this Document open, and where their caret is. Cheap, no storage, entirely
   ephemeral, and it removes most conflicts by making people not collide in the first place.
2. **Live text** — both carets edit the same text and both see the other's keystrokes. This is the
   expensive one and the one that cannot be half-built.
3. **Versions that still mean something** — deevy's Documents are versioned on purpose: a Gate approves
   text, an Agent is judged on what it wrote, the Activity says "wrote spec v2". A stream of keystrokes has
   no versions in it, so the two models have to be reconciled deliberately (see "What it costs the domain").

## Options

### A. Presence only (small)

A `documents.presence` stream operation over the existing SSE transport: a Member opening the pane joins,
heartbeats every 15s, and the pane shows the avatars of everybody else in it, with a line when somebody
else's version lands ("Planner wrote v3 — reload"). Keep the `baseVersion` refusal underneath.

- **Cost**: a stream operation, an in-memory registry per instance, one component. Days, not weeks.
- **On Workers**: an in-memory registry does not survive across isolates — presence needs a Durable Object
  (see below) or a short-TTL KV table, or it silently works on Node and not in production.
- **Gets you**: the conflicts that matter avoided socially, which is how most small teams work anyway. Does
  not get you two people typing in one paragraph.

### B. CRDT over a Durable Object (the real thing)

Yjs (or Loro) as the document type, `y-prosemirror` binding it to the Tiptap editor already in the pane, and
a Cloudflare Durable Object per Document as the room: every edit is a small update broadcast to the room and
appended to the DO's storage; the DO periodically snapshots the merged state.

- **Cost**: real. New dependency (`yjs`, `y-prosemirror`, `y-protocols`), a websocket transport deevy does
  not have today (the Event stream is SSE, one way), a Durable Object binding and migration in
  `wrangler.jsonc`, and a Node equivalent for `apps/server` and for every test — the DO is the one piece
  that has no node:sqlite counterpart, so `packages/adapters` grows a third shape. Two to three weeks, and a
  permanent tax on every future change to the editor.
- **Also**: the markdown-is-the-format decision (`deevy-ui`, slice 3) survives only if the Yjs document is
  the prosemirror tree and markdown stays the serialization written at version time. Agents write markdown
  over MCP and must not need a CRDT client to do it — so `documents.write` has to apply a whole-body write
  _into_ the CRDT, not beside it.
- **Gets you**: Google-Docs behaviour, offline edits that merge, and no conflicts to explain.

### C. Operational transform on the existing RPC (not recommended)

Server-side OT with a revision number per keystroke batch, over the RPC deevy already has. No new transport,
no DO, no dependency.

- **Cost**: OT is famously easy to get subtly wrong, and the failure mode is a corrupted Document rather
  than an error message. Every rich-text feature (tables, task lists, code blocks) is a new transform.
- **Gets you**: the same behaviour as B, worse, with the bugs owned in-house. Listed for completeness.

### D. Section locks (the middle, if B is too much)

Claim the heading you are under; somebody else's claimed sections are read-only and labelled. Fits deevy's
Documents, which are headed sections by convention (Problem / Proposed outcome / Constraints).

- **Cost**: presence (A) plus a claim table and an editor that can disable a range. A week.
- **Gets you**: most of the value where two people are working on the same spec at once, without a CRDT.
  Feels dated where a modern tool feels live, and a lock still has to expire.

## What it costs the domain

Whatever is chosen, live text changes what a version **is**, and that is a product decision, not a technical
one:

- **A version has to be cut by something.** Today it is "somebody left the editor". With live text it has to
  be an explicit act (a Save/Publish), a debounce, or a Gate. The Activity line "Planner wrote spec v2" is
  worth keeping; "Planner and Ada edited spec" is not the same sentence.
- **A Gate approves a version.** There is an open gap here already, independent of this plan: a ruling
  records no Document version, so text approved at a Gate can change afterwards with nothing recording that
  it did. If Documents become live, that gap becomes the main event — an approval must pin the version it
  approved.
- **An Agent is a peer here too.** Presence, locks and CRDT rooms all have to include Agents, or the feature
  is for Humans only and deevy's whole premise leaks.

## Recommendation

**A now, B later, and pin the version at a Gate before either.** Presence plus the conflict refusal is a
week and removes most of the pain; the Gate-pins-a-version fix is smaller than both and is a correctness bug
rather than a feature. A CRDT is worth doing once Documents are demonstrably being co-written — and it wants
the websocket transport and the Durable Object to be a deliberate step of their own, not a side effect of an
editor change.
