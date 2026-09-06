import { RouterProvider } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MemberChip } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth.ts";
import { orpc } from "@/lib/orpc.ts";
import { createAppRouter } from "@/router.tsx";
import type { ShellProps } from "@/routes/shell.tsx";

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
    <SignInFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          With the GitHub account your Workspace admin allowlisted.
        </p>
      </div>
      <Button
        size="lg"
        className="w-full"
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
    </SignInFrame>
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
  const context: ShellProps = {
    workspaceName: me.data?.workspace?.name ?? "deevy",
    memberName: me.data?.user.name ?? "",
    ...(me.data?.member
      ? {
          member: {
            id: me.data.member.id,
            kind: me.data.member.kind,
            handle: me.data.member.handle,
            role: me.data.member.role,
            image: me.data.user.image,
          },
        }
      : {}),
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
    <SignInFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Signed in, not yet a Member</h1>
        <p className="text-sm text-muted-foreground">
          {email} is not a Member of this Workspace. Ask an admin to add an allowlist rule that
          matches your email domain or your GitHub organization, then sign in again.
        </p>
      </div>
      <Button variant="outline" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </SignInFrame>
  );
}

export function Suspended({ email }: { email: string }) {
  return (
    <SignInFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Your membership is suspended</h1>
        <p className="text-sm text-muted-foreground">
          {email} is a Member of this Workspace but is suspended. An admin can reinstate you.
        </p>
      </div>
      <Button variant="outline" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </SignInFrame>
  );
}

// Absolute so Better Auth sends the browser back to the SPA origin (5173 in dev),
// not to its own base URL (the Node server on 3000).
function home(): string {
  return `${window.location.origin}/`;
}

// What the legend shows: not real Members, the four things the colours mean.
const ada = { id: "legend-ada", kind: "human", user: { name: "Ada Lovelace" } } as const;
const planner = {
  id: "legend-planner",
  kind: "agent",
  handle: "planner",
  user: { name: "Planner" },
} as const;

/**
 * Everything outside the app shares this frame (after @shadcn/login-04): the
 * brand and a legend on the left — the one idea the palette encodes, that you
 * can always tell a Human from an Agent and see what waits on a Human — and on
 * the right whatever the visitor has to do: sign in, or read why they cannot.
 */
function SignInFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <section
        aria-label="About deevy"
        className="hidden flex-col justify-between border-r bg-sidebar p-10 lg:flex"
      >
        <Brand />
        <div className="flex max-w-md flex-col gap-6">
          <p className="text-2xl font-medium leading-snug tracking-tight text-balance">
            Project management where Humans and Agents work the same Issues, as peers.
          </p>
          <dl className="flex flex-col gap-3 text-sm">
            <LegendRow term={<MemberChip member={ada} />}>A Human. Round, in copper.</LegendRow>
            <LegendRow term={<MemberChip member={planner} sponsorName="Ada Lovelace" />}>
              An Agent. Squared, in teal, and always sponsored by a Human.
            </LegendRow>
            <LegendRow
              term={<StateBadge state={{ name: "Build", isGate: false, category: "active" }} />}
            >
              A State an Issue moves through.
            </LegendRow>
            <LegendRow
              term={<StateBadge state={{ name: "Intent", isGate: true, category: "active" }} />}
            >
              A Gate: a State only a Human's ruling can pass.
            </LegendRow>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">
          Agents work over MCP, in the same vocabulary, with the same rights.
        </p>
      </section>
      <section className="flex flex-col p-6 lg:p-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
        </div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground"
      >
        d
      </span>
      <span className="text-lg font-semibold tracking-tight">deevy</span>
    </div>
  );
}

function LegendRow({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3">
      <dt className="flex">{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 p-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
