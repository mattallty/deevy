/**
 * Every sign-in provider deevy offers, as far as a deevy under test can tell
 * (docs/plans/sign-in.md slice 2).
 *
 * Better Auth hardcodes GitHub's and Google's endpoints and builds GitLab's
 * and a generic OIDC provider's from a configured issuer, so the only seam
 * that covers all four is the global `fetch` they are called through.
 * `apps/server/src/index.ts` imports this file when `DEEVY_DEV_STUB_OAUTH=1`;
 * `apps/web/scripts/smoke-workers.ts` and `apps/agent/scripts/boot.ts` prepend
 * its source to a built bundle instead. Either way deevy itself — its routing,
 * its database, Better Auth's real OAuth dance — is the real one, and the
 * outside world is the only thing replaced.
 *
 * The sign-in under test says who it is in the OAuth `code`, which is the
 * email address. A provider would have handed that code out at the end of a
 * consent screen; here the caller hands it straight to the callback.
 *
 * GitHub and Google are matched by host, because their endpoints are constants
 * in Better Auth. GitLab's and the OIDC provider's are wherever the operator's
 * issuer is, so those are matched by path — but never on a loopback host,
 * which is deevy itself and must answer for its own routes.
 *
 * Everything lives inside one function so the file declares nothing at module
 * scope: its source is prepended to a bundle whose own top-level names it
 * would otherwise collide with, and esbuild refuses the duplicate rather than
 * shadowing it — which is how `vp run agent#acceptance` catches this.
 */
(() => {
  const upstream = globalThis.fetch;

  /** The token this stub mints, and the email it carries back. */
  function tokenFor(email) {
    return `stub_${email}`;
  }

  function emailIn(value) {
    return (value ?? "").replace(/^stub_/, "");
  }

  /** The bearer of a request, whatever the provider calls it. */
  function bearerEmail(request) {
    return emailIn(request.headers.get("authorization")?.split(" ")[1]);
  }

  /** deevy's own origin is not a provider: loopback goes straight past. */
  function isLoopback(host) {
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  }

  /** The name a provider would show for an address, from its local part. */
  function nameFor(email) {
    const login = email.split("@")[0] ?? "";
    return { login, name: login.charAt(0).toUpperCase() + login.slice(1) };
  }

  // ------------------------------------------------------- the signing key

  /**
   * The `id_token` is the reason this file signs anything. A generic OIDC
   * provider is only usable to Better Auth when discovery hands back an issuer
   * and a `jwks_uri` it can build a key set from, and Google verifies its token
   * against Google's certificates; so the stub generates a key pair, serves the
   * JWKS at whichever certificate URL was asked for, and signs the token it
   * hands back from the token endpoint.
   *
   * `crypto.subtle` rather than `jose`: this file's source is prepended to a
   * built Worker bundle, and a dev-only dependency that has to work inside
   * workerd is a risk it does not need. Generated on first use rather than at
   * load, so importing the file stays synchronous on both runtimes.
   */
  const KEY_ID = "deevy-stub";
  let keyPair = null;

  function signingKey() {
    keyPair ??= (async () => {
      const pair = await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );
      const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
      return {
        privateKey: pair.privateKey,
        jwk: {
          kty: exported.kty,
          n: exported.n,
          e: exported.e,
          alg: "RS256",
          use: "sig",
          kid: KEY_ID,
        },
      };
    })();
    return keyPair;
  }

  function base64url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64urlText(text) {
    return base64url(new TextEncoder().encode(text));
  }

  /** An RS256 JWT with this stub's key, valid for the hour Google allows. */
  async function idToken(claims) {
    const { privateKey } = await signingKey();
    const now = Math.floor(Date.now() / 1000);
    const header = base64urlText(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KEY_ID }));
    const payload = base64urlText(JSON.stringify({ iat: now, exp: now + 3600, ...claims }));
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
  }

  async function jwksResponse() {
    const { jwk } = await signingKey();
    return Response.json({ keys: [jwk] });
  }

  // ------------------------------------------------------- the token endpoint

  /** One half of a Basic credential, form-url-decoded per RFC 6749 §2.3.1. */
  function formDecode(value) {
    return new URLSearchParams(`v=${value}`).get("v") ?? "";
  }

  /**
   * What a token request said: the code, which is the email address, and the
   * client id, which is the audience an `id_token` has to name. Better Auth
   * sends the pair in the body or as a Basic credential depending on the
   * provider, so both are read.
   */
  async function tokenRequest(request) {
    const params = new URLSearchParams(await request.text());
    let clientId = params.get("client_id") ?? "";
    const authorization = request.headers.get("authorization") ?? "";
    if (!clientId && /^Basic /i.test(authorization)) {
      const decoded = atob(authorization.replace(/^Basic +/i, ""));
      clientId = formDecode(decoded.slice(0, decoded.indexOf(":")));
    }
    return { email: params.get("code") ?? "", clientId };
  }

  /** Who the sign-in is, in the claims every OpenID issuer here agrees on. */
  function profileClaims(email) {
    const { login, name } = nameFor(email);
    return {
      sub: email,
      email,
      email_verified: true,
      name,
      given_name: name,
      family_name: "",
      preferred_username: login,
      // No picture: a host that does not resolve is a red line in every dev console.
      picture: null,
    };
  }

  /** Those claims as an issuer signs them: bound to an issuer and an audience. */
  function idTokenClaims(email, issuer, clientId) {
    return { iss: issuer, aud: clientId, ...profileClaims(email) };
  }

  // ------------------------------------------------------- the providers

  /** The GitHub profile of whoever the code named. */
  function githubProfile(email) {
    const { login, name } = nameFor(email);
    return { id: email, login, node_id: login, name, email, avatar_url: null };
  }

  /** The GitLab profile of whoever the code named. `state` decides the sign-in. */
  function gitlabProfile(email) {
    const { login, name } = nameFor(email);
    return {
      id: email,
      username: login,
      name,
      email,
      email_verified: true,
      state: "active",
      locked: false,
      avatar_url: null,
      web_url: `https://gitlab.example/${login}`,
    };
  }

  const OIDC_DISCOVERY = "/.well-known/openid-configuration";

  /** The paths this stub answers on whatever host the operator's issuer is. */
  const OIDC_TOKEN = "/oauth2/token";
  const OIDC_USERINFO = "/oauth2/userinfo";
  const OIDC_JWKS = "/oauth2/jwks";

  /** An issuer, from a request to one of the paths derived from it. */
  function issuerOf(url, suffix) {
    return `${url.origin}${url.pathname.slice(0, -suffix.length)}`;
  }

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;

    // GitHub: endpoints Better Auth hardcodes.
    if (host === "github.com" && path === "/login/oauth/access_token") {
      const { email } = await tokenRequest(request);
      return Response.json({
        access_token: tokenFor(email),
        token_type: "bearer",
        scope: "read:user,user:email,read:org",
      });
    }
    if (host === "api.github.com") {
      const email = bearerEmail(request);
      if (path === "/user") return Response.json(githubProfile(email));
      if (path === "/user/emails") return Response.json([{ email, primary: true, verified: true }]);
      if (path === "/user/orgs") return Response.json([]);
    }

    // Google: a token endpoint that hands back a signed id_token, and the
    // certificates Better Auth verifies it against. Google's profile is the
    // token's claims, so there is no userinfo call to answer.
    if (host === "oauth2.googleapis.com" && path === "/token") {
      const { email, clientId } = await tokenRequest(request);
      return Response.json({
        access_token: tokenFor(email),
        token_type: "bearer",
        expires_in: 3600,
        scope: "openid email profile",
        id_token: await idToken(idTokenClaims(email, "https://accounts.google.com", clientId)),
      });
    }
    if (host === "www.googleapis.com" && path === "/oauth2/v3/certs") return jwksResponse();

    // GitLab and the generic OIDC provider live wherever the operator's issuer
    // is, so they are matched by path. Never on loopback: that is deevy.
    if (!isLoopback(host)) {
      if (path === "/oauth/token") {
        const { email } = await tokenRequest(request);
        return Response.json({
          access_token: tokenFor(email),
          token_type: "bearer",
          expires_in: 3600,
          scope: "read_user read_api",
        });
      }
      if (path === "/api/v4/user") return Response.json(gitlabProfile(bearerEmail(request)));
      if (path === "/api/v4/groups") return Response.json([]);

      if (path.endsWith(OIDC_DISCOVERY)) {
        const issuer = issuerOf(url, OIDC_DISCOVERY);
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/oauth2/authorize`,
          token_endpoint: `${issuer}${OIDC_TOKEN}`,
          userinfo_endpoint: `${issuer}${OIDC_USERINFO}`,
          jwks_uri: `${issuer}${OIDC_JWKS}`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid", "profile", "email"],
          token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
          code_challenge_methods_supported: ["S256"],
        });
      }
      if (path.endsWith(OIDC_TOKEN)) {
        const { email, clientId } = await tokenRequest(request);
        return Response.json({
          access_token: tokenFor(email),
          token_type: "bearer",
          expires_in: 3600,
          scope: "openid profile email",
          id_token: await idToken(idTokenClaims(email, issuerOf(url, OIDC_TOKEN), clientId)),
        });
      }
      if (path.endsWith(OIDC_USERINFO)) return Response.json(profileClaims(bearerEmail(request)));
      if (path.endsWith(OIDC_JWKS)) return jwksResponse();
    }

    return upstream(input, init);
  };
})();
