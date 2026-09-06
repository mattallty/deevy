import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "@deevy/design-system";

/** A form in a Dialog, open. The kit portals it to the body; the card keeps it inside. */
export const NewIssue = () => (
  <Dialog open>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New Issue</DialogTitle>
        <DialogDescription>In DEV. It starts in Backlog, unassigned.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="new-issue-title">Title</FieldLabel>
          <Input id="new-issue-title" defaultValue="Add ruling authority to Gate" />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-issue-body">Description</FieldLabel>
          <Textarea id="new-issue-body" rows={4} placeholder="What, and why. Markdown." />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button>Create Issue</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
