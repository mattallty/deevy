import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "@deevy/design-system";
import { CircleAlert, Info, KeyRound } from "lucide-react";

/** Something to know, with what to do about it in the corner. */
export const Default = () => (
  <Alert className="max-w-lg">
    <Info />
    <AlertTitle>Builder has no API key</AlertTitle>
    <AlertDescription>It cannot start a Run until its Sponsor creates one.</AlertDescription>
    <AlertAction>
      <Button variant="outline" size="xs">
        Create key
      </Button>
    </AlertAction>
  </Alert>
);

/** Something gone wrong: the text turns to the destructive colour. */
export const Destructive = () => (
  <Alert variant="destructive" className="max-w-lg">
    <CircleAlert />
    <AlertTitle>Builder is suspended</AlertTitle>
    <AlertDescription>
      Its Runs stopped and its keys are refused. Reinstate it to let it pick up DEV-41 again.
    </AlertDescription>
    <AlertAction>
      <Button variant="outline" size="xs">
        Reinstate
      </Button>
    </AlertAction>
  </Alert>
);

/** Without an action, and without an icon. */
export const Plain = () => (
  <div className="flex max-w-lg flex-col gap-3">
    <Alert>
      <KeyRound />
      <AlertTitle>Copy the key now</AlertTitle>
      <AlertDescription>
        deevy shows it once; after this page only its first characters remain.
      </AlertDescription>
    </Alert>
    <Alert>
      <AlertTitle>The Workflow has unsaved changes</AlertTitle>
      <AlertDescription>Save it before leaving the page, or they are lost.</AlertDescription>
    </Alert>
  </div>
);
