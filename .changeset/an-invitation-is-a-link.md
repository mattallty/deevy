---
"@deevy/core": patch
"@deevy/db": patch
---

An admin can now admit exactly one person, instead of opening the door to their whole email domain. A new
`invitations.create` takes an address and a role and hands back a URL to send however the admin likes — deevy
has no email Channel, so nothing about inviting somebody waits on a mail transport. `invitations.list` and
`invitations.revoke` are the other two admin operations, and `invitations.accept` is what the invited Human
calls after signing in with whichever provider the instance offers.

The link is a bearer: 32 random bytes, shown once in the response that created them, stored only as a
SHA-256 hash, and in no Event payload and no list output. An admin who loses one revokes the invitation and
issues another. An invitation is good for seven days, one address may hold one live invitation at a time,
and the invited address has to be the address that signs in — a forwarded link is not a second seat. An
unknown token is a 404, an expired or revoked one a 400, a mismatched address a 403 naming the address the
invitation was for, and somebody who is already a Member gets their Member row back rather than an error.

Accepting inserts the Member with the invited role and appends `invitation.accepted` and `member.joined`, so
the Workspace's history reads the same whether a teammate joined by an allowlist rule or by invitation. The
`invitation` table is a new migration; the SPA screens that create and accept invitations follow.
