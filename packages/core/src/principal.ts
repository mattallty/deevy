import { apiKeyPrefix, bearerToken } from "./auth.ts";
import type { Auth, Session } from "./auth.ts";
import type { Principal } from "./operations/registry.ts";

/**
 * How the JSON Web Key Set is fetched when an OAuth access token is verified.
 * requireMcpAuth self-fetches /jwks over the network and fails when the
 * authorization server and the resource server are the same process
 * (better-auth#10888), so slice 7 verifies the token itself and dispatches this
 * into `auth.handler` in process (docs/plans/m2.md).
 */
export type JwksFetch = (request: Request) => Promise<Response>;

export interface ResolvePrincipalOptions {
  /** Absent only in the Workers smoke build, which has no auth yet. */
  auth?: Auth;
  headers: Headers;
  jwksFetch?: JwksFetch;
}

export interface ResolvedPrincipal {
  principal: Principal;
  session: Session | null;
}

const anonymous: ResolvedPrincipal = { principal: { kind: "anonymous" }, session: null };

/**
 * How a request authenticated, decided once per request (docs/plans/m2.md).
 * An Agent's API key and a Human MCP client's OAuth token arrive on the same
 * header at the same endpoint, so the arms are ordered and the deevy key prefix
 * is the discriminator.
 */
export async function resolvePrincipal({
  auth,
  headers,
  jwksFetch,
}: ResolvePrincipalOptions): Promise<ResolvedPrincipal> {
  if (!auth) return anonymous;

  // A bearer is answered by the bearer arms alone. Falling back to the cookie
  // when the credential fails would let a Human's browser session answer for a
  // bad key, so a request with a bearer is either that bearer or nobody.
  const bearer = bearerToken(headers);
  if (bearer) {
    return bearer.startsWith(apiKeyPrefix)
      ? await fromApiKey(auth, bearer)
      : await fromAccessToken(auth, bearer, jwksFetch);
  }

  const session = await auth.api.getSession({ headers });
  return session ? { principal: { kind: "cookie" }, session } : anonymous;
}

/**
 * An Agent's key stands for its Member, so the resolved session names the key's
 * user the way a cookie session names a Human. The key itself never reaches the
 * context: only its id, for the Event log and for revocation.
 */
async function fromApiKey(auth: Auth, key: string): Promise<ResolvedPrincipal> {
  const verified = await auth.api.verifyApiKey({ body: { key } });
  if (!verified.valid || !verified.key) return anonymous;
  const context = await auth.$context;
  const user = await context.internalAdapter.findUserById(verified.key.referenceId);
  if (!user) return anonymous;
  return {
    principal: { kind: "api_key", keyId: verified.key.id },
    session: {
      user,
      session: {
        // Not a session row: nothing persists it, and the token is the key's
        // id rather than the key, so the secret stays out of the context.
        id: verified.key.id,
        userId: user.id,
        token: verified.key.id,
        createdAt: verified.key.createdAt,
        updatedAt: verified.key.updatedAt,
        expiresAt: verified.key.expiresAt ?? new Date(Date.now() + 86_400_000),
      },
    } as Session,
  };
}

/**
 * A Human MCP client's OAuth access token (slice 7). Until deevy is an
 * authorization server there is nothing to verify against, so the token is
 * nobody; the shape is here because the arm's position in the order is what
 * matters now.
 */
async function fromAccessToken(
  _auth: Auth,
  _token: string,
  _jwksFetch?: JwksFetch,
): Promise<ResolvedPrincipal> {
  // TODO(m2 slice 7): verifyJwsAccessToken({ token, jwksFetch }) with a
  // jwksFetch that dispatches into auth.handler in process, then
  // { kind: "oauth", clientId, scopes } from the verified claims.
  return anonymous;
}
