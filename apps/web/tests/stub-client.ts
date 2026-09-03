/**
 * The shape every SPA test mocks `lib/orpc` with. Each slice adds operations,
 * and a test that does not care about them should not have to know they exist,
 * so the defaults answer everything with something empty and a test overrides
 * only what it asserts on.
 */
type StubOperation = (input: never) => unknown;

export interface StubOverrides {
  [namespace: string]: Record<string, StubOperation> | undefined;
}

const emptyIssue = {
  id: "stub-issue",
  key: "DEV-0",
  number: 0,
  title: "Stub",
  description: null,
  state: { id: "stub-state", name: "Build", position: 0, isGate: false, category: "active" },
  assignee: null,
  assigneeMemberId: null,
  parent: null,
  parentId: null,
  children: [],
  gateDecisions: [],
  labels: [],
  closedAt: null,
  updatedAt: new Date(),
  project: { id: "stub-project", key: "DEV", name: "deevy" },
};

// The return type is deliberately loose: createTanstackQueryUtils wants a real
// client shape, and a stub only ever implements the operations a test touches.
export function stubClient(overrides: StubOverrides = {}): never {
  const base: Record<string, Record<string, StubOperation>> = {
    me: { get: async () => ({ user: {}, member: { role: "admin" }, workspace: {} }) },
    workspace: {
      get: async () => ({ id: "w1", name: "deevy", slug: "deevy" }),
      update: async () => ({ id: "w1", name: "deevy", slug: "deevy" }),
    },
    members: {
      list: async () => ({ members: [] }),
      updateRole: async () => ({}),
      suspend: async () => ({}),
      reinstate: async () => ({}),
    },
    teams: {
      list: async () => ({ teams: [] }),
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({ deleted: true }),
      addMember: async () => ({}),
      removeMember: async () => ({}),
    },
    allowlist: {
      list: async () => ({ rules: [] }),
      add: async () => ({}),
      remove: async () => ({ removed: true }),
    },
    projects: {
      list: async () => ({ projects: [] }),
      get: async () => ({
        ...emptyIssue.project,
        description: null,
        team: null,
        archivedAt: null,
        states: [],
      }),
      create: async () => ({}),
      update: async () => ({}),
      archive: async () => ({}),
    },
    workflow: { get: async () => ({ states: [] }), update: async () => ({ states: [] }) },
    issues: {
      list: async () => ({ issues: [], nextCursor: null }),
      get: async () => emptyIssue,
      create: async () => emptyIssue,
      update: async () => emptyIssue,
      move: async () => emptyIssue,
      setLabels: async () => emptyIssue,
    },
    gates: { approve: async () => emptyIssue, reject: async () => emptyIssue },
    labels: {
      list: async () => ({ labels: [] }),
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({ deleted: true }),
    },
    documents: {
      list: async () => ({ documents: [] }),
      get: async () => ({
        id: "d",
        name: "intent",
        currentVersion: 1,
        version: 1,
        body: "",
        authorMemberId: null,
      }),
      write: async () => ({}),
    },
    inbox: {
      list: async () => ({ notifications: [], nextCursor: null }),
      unreadCount: async () => ({ unread: 0 }),
      markRead: async () => ({ read: 0 }),
      markAllRead: async () => ({ read: 0 }),
    },
    repositories: {
      list: async () => ({ repositories: [] }),
      create: async () => ({}),
      delete: async () => ({ deleted: true }),
    },
    links: {
      list: async () => ({ links: [] }),
      add: async () => ({}),
      remove: async () => ({ removed: true }),
    },
    comments: {
      list: async () => ({ comments: [] }),
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({ deleted: true }),
    },
    events: {
      list: async () => ({ events: [], nextCursor: null }),
      // Stays open the way the real stream does, so the live hook does not spin.
      subscribe: async () =>
        (async function* () {
          await new Promise(() => {});
        })(),
    },
  };

  for (const [namespace, operations] of Object.entries(overrides)) {
    base[namespace] = { ...base[namespace], ...operations };
  }
  return base as never;
}
