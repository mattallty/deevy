import { ApproversPicker } from "@deevy/design-system";
import { useState } from "react";
import { ada, grace } from "./lib/fixtures";

const humans = [ada, grace];

/** Nobody named: the placeholder says any Human may decide the Gate. */
export const Empty = () => {
  const [value, setValue] = useState<string[]>([]);
  return (
    <div className="w-80">
      <ApproversPicker id="approvers-empty" humans={humans} value={value} onChange={setValue} />
    </div>
  );
};

/** Two Humans named, as chips; the box asks for more. */
export const TwoHumans = () => {
  const [value, setValue] = useState<string[]>([ada.id, grace.id]);
  return (
    <div className="w-80">
      <ApproversPicker id="approvers-two" humans={humans} value={value} onChange={setValue} />
    </div>
  );
};
