/**
 * GitHub, as far as a Worker under test can tell (docs/plans/m3.md slice 5).
 *
 * Better Auth hardcodes GitHub's three endpoints, so the only seam left is the
 * global `fetch` the isolate calls them through. `scripts/smoke-workers.ts`
 * prepends this file to the built Worker bundle and points a second
 * `wrangler dev` at the result: the Worker, its D1 binding and its routing are
 * the real ones, and the outside world is the only thing replaced.
 *
 * The sign-in under test says who it is in the OAuth `code`, which is the
 * email address. GitHub would have handed that code out at the end of a
 * consent screen; here the test hands it straight to the callback.
 */
const upstream = globalThis.fetch;

/** The GitHub profile of whoever the code named. */
function profileFor(email) {
  const login = email.split("@")[0];
  return {
    id: email,
    login,
    node_id: login,
    name: login.charAt(0).toUpperCase() + login.slice(1),
    email,
    // No picture: a host that does not resolve is a red line in every dev console.
    avatar_url: null,
  };
}

/** The email in a bearer token this stub minted, or in the code it was asked for. */
function emailIn(value) {
  return (value ?? "").replace(/^gho_/, "");
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const host = url.hostname;

  if (host === "github.com" && url.pathname === "/login/oauth/access_token") {
    const body = await request.text();
    const code = new URLSearchParams(body).get("code") ?? "";
    return Response.json({
      access_token: `gho_${code}`,
      token_type: "bearer",
      scope: "read:user,user:email",
    });
  }

  if (host === "api.github.com") {
    const email = emailIn(request.headers.get("authorization")?.split(" ")[1]);
    if (url.pathname === "/user") return Response.json(profileFor(email));
    if (url.pathname === "/user/emails") {
      return Response.json([{ email, primary: true, verified: true }]);
    }
    if (url.pathname === "/user/orgs") return Response.json([]);
  }

  return upstream(input, init);
};
