---
"@deevy/core": patch
---

A Human who signs in with a second provider stays one Member. deevy now states its account-linking policy
rather than inheriting Better Auth's defaults: a sign-in whose address a user already holds links onto that
user, every provider the environment configured is trusted for it and only those, and a link is always the
same address at both ends. So a teammate who joined with one provider in March and signs in with another in
April keeps one handle, one inbox and one Member row.

The trusted list is the same one `health.ping` reports and the sign-in page draws its buttons from, so
configuring an IdP is never also remembering to trust it — and un-configuring one withdraws that trust. The
account already holding an address still has to have proved it: a sign-in that would link onto a row whose
email was never verified is refused with `account_not_linked` rather than joining the two, and creates no
second Human on the address.
