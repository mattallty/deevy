import { describe, expect, it } from "vite-plus/test";
import { describeNotification } from "../src/lib/notification-text.ts";

const issue = { state: { name: "Intent" } };

describe("describeNotification", () => {
  it("names the Gate and quotes the note on a ruling", () => {
    expect(
      describeNotification({
        kind: "gate_awaiting",
        issue,
        event: {
          kind: "gate.rejected",
          payload: { state: "Spec", to: "Intent", note: "Not yet." },
        },
      }),
    ).toEqual({ verb: "rejected the Spec Gate", excerpt: "Not yet.", tone: "gate" });
    expect(
      describeNotification({
        kind: "gate_awaiting",
        issue,
        event: { kind: "gate.approved", payload: { state: "Intent", to: "Spec", note: null } },
      }).verb,
    ).toBe("approved the Intent Gate → Spec");
  });

  it("says which Gate an Issue arrived in", () => {
    expect(
      describeNotification({
        kind: "gate_awaiting",
        issue,
        event: { kind: "issue.moved", payload: { from: "Build", to: "Review" } },
      }).verb,
    ).toBe("moved it into the Review Gate");
    expect(
      describeNotification({
        kind: "gate_awaiting",
        issue,
        event: { kind: "issue.created", payload: {} },
      }).verb,
    ).toBe("created it in the Intent Gate");
  });

  it("quotes the question, the summary and the comment", () => {
    expect(
      describeNotification({
        kind: "run_awaiting_input",
        issue,
        event: { kind: "run.awaiting_input", payload: { question: "Exponential or fixed?" } },
      }),
    ).toEqual({ verb: "asks a question", excerpt: "Exponential or fixed?", tone: "agent" });
    expect(
      describeNotification({
        kind: "run_finished",
        issue,
        event: { kind: "run.failed", payload: { summary: "Tests timed out." } },
      }),
    ).toEqual({ verb: "failed a Run", excerpt: "Tests timed out.", tone: "destructive" });
    expect(
      describeNotification({
        kind: "mention",
        issue,
        event: { kind: "comment.created", payload: { commentId: "c1" } },
        comment: { id: "c1", body: "@ada look" },
      }),
    ).toEqual({ verb: "mentioned you", excerpt: "@ada look", tone: "human" });
    expect(
      describeNotification({
        kind: "mention",
        issue,
        event: { kind: "comment.created", payload: { commentId: "c1" } },
        comment: { id: "c1", body: null },
      }).excerpt,
    ).toBe("(the comment was withdrawn)");
  });

  it("says when a State rule did the assigning", () => {
    expect(
      describeNotification({
        kind: "assignment",
        issue,
        event: { kind: "issue.assigned", payload: { to: "m", byStateRule: true } },
      }).verb,
    ).toBe("assigned it to you, entering Intent");
  });
});
