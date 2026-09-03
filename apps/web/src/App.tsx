import { useQuery } from "@tanstack/react-query";
import { authClient } from "./lib/auth.ts";
import { orpc } from "./lib/orpc.ts";

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <Shell>Loading…</Shell>;
  if (!session) return <SignedOut />;
  return <SignedIn />;
}

export function SignedOut() {
  return (
    <Shell>
      <h1>deevy</h1>
      <p>Project management where Humans and Agents collaborate as peers.</p>
      <button
        type="button"
        onClick={() =>
          authClient.signIn.social({
            provider: "github",
            callbackURL: home(),
            errorCallbackURL: home(),
          })
        }
      >
        Sign in with GitHub
      </button>
    </Shell>
  );
}

function SignedIn() {
  const me = useQuery(orpc.me.get.queryOptions());
  if (me.isPending) return <Shell>Loading…</Shell>;
  if (me.isError) return <Shell>Could not load your profile: {me.error.message}</Shell>;
  const { user, member, workspace } = me.data;
  return (
    <Shell>
      <header className="row">
        <strong>{workspace?.name ?? "deevy"}</strong>
        <span className="spacer" />
        <span>{user.name}</span>
        <button type="button" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </header>
      {workspace && member ? (
        <section>
          <h1>{workspace.name}</h1>
          <p>
            You are a {member.role} of this Workspace. It is empty: Projects and Issues arrive with
            M1.
          </p>
        </section>
      ) : (
        <section>
          <h1>Signed in, not yet a Member</h1>
          <p>
            {user.email} is not a Member of this Workspace. Ask an admin for an invitation, or set
            DEEVY_ADMIN_EMAIL to this address before the first sign-in.
          </p>
        </section>
      )}
    </Shell>
  );
}

// Absolute so Better Auth sends the browser back to the SPA origin (5173 in dev),
// not to its own base URL (the Node server on 3000).
function home(): string {
  return `${window.location.origin}/`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="shell">{children}</main>;
}
