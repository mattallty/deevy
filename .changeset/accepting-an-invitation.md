---
"@deevy/web": patch
---

The invitation an admin creates is now a link somebody can actually use, and the admin can see who has not
used theirs. `/invite/<token>` shows the sign-in page under a line saying an invitation is waiting — it can
say no more, because the token is a bearer and there is nothing to read without one — and holds the token
for the sign-in that follows. Sign in with any provider the instance offers and the screen that used to say
only "signed in, not yet a Member" spends the invitation instead, landing you in the Workspace. Somebody who
signs in first and clicks the link second joins the same way, and a Member who lands on one is already in,
so it takes them home.

An address that does not match gets the message the operation gives, naming the address the invitation was
for, with Sign out and try another account beside it: the link is still held, so signing in as the invited
address still works. That screen also now names an invitation as a way in, beside an allowlist rule.

Settings, Workspace gains an **Invited** row under Who may join: every invitation that is still outstanding,
with its address, its role and how long it has left, each with Revoke. Invite someone opens a dialog for an
address and a role, and the link it hands back is shown there once and nowhere else — deevy keeps only a
hash of the token, so there is no Copy link on a row and no way to see it again; revoke the invitation and
make another if it goes astray. An invitation that has run out of time is still listed, marked Expired,
because it holds its address until it is revoked.
