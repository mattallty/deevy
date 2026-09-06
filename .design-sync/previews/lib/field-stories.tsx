import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  Switch,
  Textarea,
} from "@deevy/design-system";

/** Label, control, description: the unit every deevy form is built from. */
export const Default = () => (
  <Field className="max-w-sm">
    <FieldLabel htmlFor="field-name">Name</FieldLabel>
    <Input id="field-name" defaultValue="Agent loop" />
    <FieldDescription>Shown in the sidebar and on every Issue key.</FieldDescription>
  </Field>
);

/** `data-invalid` turns the Field's text destructive; FieldError carries the message. */
export const Invalid = () => (
  <Field className="max-w-sm" data-invalid>
    <FieldLabel htmlFor="field-key">Project key</FieldLabel>
    <Input id="field-key" defaultValue="development" aria-invalid className="font-mono uppercase" />
    <FieldError>A key is 2 to 5 letters; it prefixes every Issue, like DEV-42.</FieldError>
  </Field>
);

/** Several messages fold into a list. */
export const Errors = () => (
  <Field className="max-w-sm" data-invalid>
    <FieldLabel htmlFor="field-handle">Handle</FieldLabel>
    <Input id="field-handle" defaultValue="Planner Agent" aria-invalid />
    <FieldError
      errors={[
        { message: "Lowercase letters, digits and dashes only." },
        { message: "Another Member already uses this handle." },
      ]}
    />
  </Field>
);

/** Horizontal: the control leads, the words follow. A Checkbox or a Switch reads this way. */
export const Horizontal = () => (
  <div className="flex max-w-sm flex-col gap-4">
    <Field orientation="horizontal">
      <Checkbox id="field-gate" defaultChecked />
      <FieldContent>
        <FieldLabel htmlFor="field-gate">Gate</FieldLabel>
        <FieldDescription>An Issue waits here until a Human rules on it.</FieldDescription>
      </FieldContent>
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="field-autorun">Start a Run on entry</FieldLabel>
        <FieldDescription>The State's Agent picks the Issue up as it arrives.</FieldDescription>
      </FieldContent>
      <Switch id="field-autorun" />
    </Field>
  </div>
);

/** A whole form: a FieldGroup of Fields, a FieldSet with a legend, a separator, the actions. */
export const NewProject = () => (
  <form className="w-full max-w-md" onSubmit={(submitted) => submitted.preventDefault()}>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="np-name">Name</FieldLabel>
        <Input id="np-name" placeholder="Agent loop" />
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="np-key">Key</FieldLabel>
        <Input id="np-key" defaultValue="A" aria-invalid className="w-24 font-mono uppercase" />
        <FieldError>Two letters at least.</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="np-description">Description</FieldLabel>
        <Textarea id="np-description" rows={3} placeholder="What this Project is for." />
        <FieldDescription>Markdown. Agents read it before their first Run.</FieldDescription>
      </Field>
      <FieldSeparator>Who works here</FieldSeparator>
      <FieldSet>
        <FieldLegend>Members</FieldLegend>
        <FieldDescription>
          Every Human in the Workspace can see the Project; these may change it.
        </FieldDescription>
        <Field orientation="horizontal">
          <Checkbox id="np-ada" defaultChecked />
          <FieldLabel htmlFor="np-ada">Ada Lovelace</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="np-grace" />
          <FieldLabel htmlFor="np-grace">Grace Hopper</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="np-planner" defaultChecked />
          <FieldContent>
            <FieldLabel htmlFor="np-planner">Planner</FieldLabel>
            <FieldDescription>An Agent; Ada Lovelace sponsors it.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldSet>
      <Field orientation="horizontal" className="justify-end">
        <Button variant="ghost" type="button">
          Cancel
        </Button>
        <Button type="submit">Create Project</Button>
      </Field>
    </FieldGroup>
  </form>
);

/** A FieldLabel that wraps a Field becomes a selectable card; `FieldTitle` is the small heading inside. */
export const Choice = () => (
  <FieldGroup className="max-w-sm">
    <FieldLabel htmlFor="choice-any">
      <Field orientation="horizontal">
        <Checkbox id="choice-any" defaultChecked />
        <FieldContent>
          <FieldTitle>Any Human may rule</FieldTitle>
          <FieldDescription>The first Human to open the Gate decides it.</FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
    <FieldLabel htmlFor="choice-named">
      <Field orientation="horizontal">
        <Checkbox id="choice-named" />
        <FieldContent>
          <FieldTitle>Only named approvers</FieldTitle>
          <FieldDescription>Pick the Humans below; an Agent never rules a Gate.</FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
  </FieldGroup>
);
