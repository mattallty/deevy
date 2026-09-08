---
"@deevy/core": patch
"@deevy/web": patch
"@deevy/server": patch
---

An instance behind an OpenID Connect IdP — Okta, Entra, Keycloak, Authentik, anything that publishes a
discovery document — now offers one sign-in button that works, configured from four environment variables and
nothing else. Set `DEEVY_OIDC_ISSUER` to where the IdP publishes `/.well-known/openid-configuration`
(`https://acme.okta.com`, a Keycloak or Authentik realm URL with its path), `DEEVY_OIDC_CLIENT_ID` and
`DEEVY_OIDC_CLIENT_SECRET` to the client pair, and the sign-in page draws the button beside whatever else is
configured. The Redirect URI to register with the IdP is `${BETTER_AUTH_URL}/api/auth/callback/oidc` — deevy's
own name for the entry, whatever the IdP is called. All three or none: the authorization, token, userinfo and
JWKS endpoints are read out of the discovery document, so an issuer is as load-bearing as a client id.

`DEEVY_OIDC_NAME` is what the button says, defaulting to "Single sign-on". It is reported by `health.ping` with
the rest of the providers, so naming your IdP "Acme SSO" is a variable and not a deployment of the SPA.

deevy asks for `openid`, `profile` and `email` and nothing more, uses PKCE, and refuses to register a provider
whose discovery document names no issuer and no `jwks_uri`: an OIDC sign-in's identity is its `id_token`'s
claims, and a token nobody can verify is not an identity. Who may join is unchanged — the allowlist decides,
and an `email_domain` rule admits the addresses the IdP hands out. A teammate who already signed in with
another provider keeps their one Member: the OIDC sign-in links onto the address they already hold.

One entry, not a list. A self-hosted deevy has one IdP, and a second one would be JSON in a secret.
