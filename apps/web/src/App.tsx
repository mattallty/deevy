import { RouterProvider } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth.ts";
import { orpc } from "@/lib/orpc.ts";
import { createAppRouter } from "@/router.tsx";

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <Centered>Loading…</Centered>;
  if (!session) return <SignedOut />;
  return <SignedIn />;
}

export function SignedOut() {
  return (
    <Centered>
      <h1 className="text-3xl font-semibold">deevy</h1>
      <p className="text-muted-foreground">
        Project management where Humans and Agents collaborate as peers.
      </p>
      <Button
        onClick={() =>
          authClient.signIn.social({
            provider: "github",
            callbackURL: home(),
            errorCallbackURL: home(),
          })
        }
      >
        Sign in with GitHub
      </Button>
    </Centered>
  );
}

function SignedIn() {
  const me = useQuery(orpc.me.get.queryOptions());
  const context = {
    workspaceName: me.data?.workspace?.name ?? "deevy",
    memberName: me.data?.user.name ?? "",
  };
  // The router is built once; its context is refreshed as `me` resolves.
  const router = useMemo(() => createAppRouter(context), []);
  router.update({ context });

  if (me.isPending) return <Centered>Loading…</Centered>;
  if (me.isError) return <Centered>Could not load your profile: {me.error.message}</Centered>;

  const { user, member, workspace } = me.data;
  if (!workspace || !member) return <NotAMember email={user.email} />;
  if (member.suspendedAt) return <Suspended email={user.email} />;
  return <RouterProvider router={router} />;
}

export function NotAMember({ email }: { email: string }) {
  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Signed in, not yet a Member</h1>
      <p className="text-muted-foreground">
        {email} is not a Member of this Workspace. Ask an admin to add an allowlist rule that
        matches your email domain or your GitHub organization, then sign in again.
      </p>
      <Button variant="outline" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </Centered>
  );
}

export function Suspended({ email }: { email: string }) {
  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Your membership is suspended</h1>
      <p className="text-muted-foreground">
        {email} is a Member of this Workspace but is suspended. An admin can reinstate you.
      </p>
      <Button variant="outline" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </Centered>
  );
}

// Absolute so Better Auth sends the browser back to the SPA origin (5173 in dev),
// not to its own base URL (the Node server on 3000).
function home(): string {
  return `${window.location.origin}/`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 p-6">
      {children}
    </main>
  );
}
