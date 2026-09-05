import { RouterProvider } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  // Public, so it answers before anyone is signed in: whether this instance
  // signs in through the development stub (DEEVY_DEV_STUB_GITHUB).
  const health = useQuery(orpc.health.ping.queryOptions());
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
      {health.data?.devSignIn ? <DevSignIn /> : null}
    </Centered>
  );
}

/**
 * Sign in as any email, on an instance whose GitHub is the stub
 * (apps/web/scripts/stub-github.js). It is Better Auth's real OAuth dance with
 * the consent screen skipped: start the social sign-in to get a `state`, then
 * land on the callback with the email as the `code`, exactly as the acceptance
 * walk does over HTTP (apps/claude-agent/scripts/acceptance.ts).
 */
export function DevSignIn({
  navigate = (url: string) => window.location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      aria-label="Development sign-in"
      className="flex flex-col gap-3 rounded-md border border-dashed p-4"
      onSubmit={async (submitted) => {
        submitted.preventDefault();
        setPending(true);
        setError(null);
        try {
          const started = await fetch("/api/auth/sign-in/social", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ provider: "github", callbackURL: home() }),
          });
          const { url } = (await started.json()) as { url?: string };
          const state = url ? new URL(url).searchParams.get("state") : null;
          if (!state) throw new Error("the server did not start a sign-in");
          const callback = new URL("/api/auth/callback/github", window.location.origin);
          callback.searchParams.set("state", state);
          callback.searchParams.set("code", email.trim());
          navigate(callback.toString());
        } catch (failed) {
          setError(failed instanceof Error ? failed.message : String(failed));
          setPending(false);
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">GitHub is a stub on this instance</span>
        <span className="text-xs text-muted-foreground">
          Any email signs in. The one in DEEVY_ADMIN_EMAIL becomes the Workspace admin.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dev-email">Email</Label>
        <Input
          id="dev-email"
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(changed) => setEmail(changed.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending || !email.trim()}>
        Sign in as this email
      </Button>
    </form>
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
