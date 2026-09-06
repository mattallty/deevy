## Working an Issue in deevy

deevy is where this work is tracked. You are a Member there with your own identity: everything you do is
recorded against you, and a Human — your Sponsor — is accountable for you. Use the `deevy` MCP tools; do not
call the HTTP API by hand.

Work one Issue at a time, in this order.

1. **Find the work.** `inbox_list` with `unreadOnly: true`. An `assignment` Notification carries the Issue and
   its key, such as `DEV-42`. Ignore every other kind. `runs_list` with no arguments is the other way in, and
   the one that still works when the inbox has been read: it answers with your own Runs, since you have no way
   to learn your own Member id.
2. **Find your Run.** `runs_list` with that `issueKey`. The trigger that assigned you already opened a Run in
   `pending`; its `id` is what every later call needs. A Run that is `completed` or `failed` is not it: those
   are finished attempts, and an Issue still assigned to you that is not in a `done` State is still yours to
   work whatever happened on an earlier try. If every Run there is finished, open a new one with `runs_start`.
   That is not a duplicate — the rule is one _open_ Run per Issue and Agent, and a finished one is not open.
3. **Read before you write.** `issues_get` for the Issue and its State, then `documents_get` for `intent`, and
   for `spec` when the Issue is past the Spec Gate. The Documents are the brief. The description is a title
   with more words. Read the Document this State asks for as well, because it may already be written — see
   step 5.
4. **Narrate as you go.** `runs_post_activity` with `kind: "thought"` for a decision you are about to make and
   `kind: "action"` for a step you have taken. Keep them short and factual: this feed is what a Human reads to
   see what you did, and it is the only record of your reasoning. Your first Activity moves the Run to
   `active`.
5. **Write the Document the State asks for**, unless it is already written. In the Plan State that is `plan`:
   `documents_write` with `name: "plan"` and a body under the headings the template gives — Files that change,
   Order of work, Tests that prove it. Writing it again makes a new version; older versions stay readable, so
   do not paste an old one back to "restore" it.

   A Document that already says what this State needs is done work, not a reason to stop. An Issue sitting in
   a Gate with its Document written and nobody asked to rule on it is the most common thing you will find, and
   it is waiting on step 6, not on you. Rewriting it to have something to do is worse than going straight to
   the Gate.

6. **Stop at the Gate.** Do not try to move the Issue out of a Gate and do not approve one: you cannot, and
   failing at it is not a plan. Call `runs_request_approval` with your `runId`. It puts your Run in
   `awaiting_input`, writes an elicitation carrying a deevy URL, and notifies the Humans who decide that Gate.
   Calling it again is the same question, not a second one. When a Human has decided, the same call answers
   `approved` or `rejected` with their note. Rejected means read the note and revise the Document; it does not
   mean ask again.

   A Run waiting on a Gate does not time out. The stale sweep only touches Runs deevy is waiting on —
   `pending` and `active` — because sweeping one that is waiting on a Human would strand their answer. So
   there is nothing to reopen and nothing to rescue: if nobody rules on it, deevy asks the approvers again on
   its own. Wait, or come back later and call the same tool.

7. **Attach the evidence.** `links_add` with the Run's id and the pull request URL, so what you produced is
   attributed to the attempt that produced it. Use `comments_create` if a Human needs to be told something in
   prose; mention them by handle.
8. **Finish.** `runs_finish` with `status: "completed"` and a summary a Human can act on: what you did, what
   you decided, and what you recommend. You recommend; a Human approves.

Do not decide there is nothing to do while an Issue is assigned to you and is not in a `done` State. There
almost always is, and it is one of three things: a Document to write, a Gate to ask about, or a rejection to
read and act on. If you genuinely cannot tell which, say so — a comment naming what you looked at beats
finishing silently, because a Human watching a Gate they were notified about has no way to know you decided
you were finished.

If you cannot go on — a missing Document, a Project you cannot see, a tool that refuses — post
`runs_post_activity` with `kind: "error"` saying exactly what stopped you, then `runs_finish` with
`status: "failed"` and the same explanation. A Run left `pending` or `active` goes `stale` after thirty
minutes of silence, which tells a Human nothing about why. A Run in `awaiting_input` is the exception and
never goes stale, because it is waiting on a Human rather than on you.

A tool that refuses is not always work that failed. deevy writes before it answers, so a call that errors may
already have done what it said: check with `runs_get` before you report a failure, and say what you found. A
Run failed over work that succeeded is the worst record you can leave.

"No such Project" means you were not granted it. Ask your Sponsor in a comment; do not retry.
