---
"@deevy/core": patch
---

A second sign-in links onto the Human who already holds the address only when the provider says the address
is verified. deevy no longer trusts a provider simply because the deployment configured it.

GitHub and Google always report a verified address, and GitLab reports it as a `confirmed_at` stamp, so
nothing changes for those three. An OpenID Connect IdP that sends no `email_verified` claim at all —
Microsoft Entra is one — can no longer become somebody's second provider: that sign-in is refused with
`account_not_linked`, and the teammate keeps using the provider they started with.

The reason to fail in that direction: trusting every configured provider meant the claim was never read, so
an IdP with open self-registration could hand somebody an account on a colleague's address and have it
linked onto that colleague's Member — even when the IdP truthfully said the address was unverified.
