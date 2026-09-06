import {
  Button,
  Input,
  Label,
  MemberChip,
  SettingsPage,
  SettingsSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deevy/design-system";
import { ada, builder, grace, planner } from "./lib/fixtures";

/** Settings › Members: a header, a list section, a form section and a danger zone. */
export const Members = () => (
  <SettingsPage
    title="Members"
    description="Humans and the Agents they sponsor."
    actions={<Button>Invite a Human</Button>}
  >
    <SettingsSection title="Humans" aria-label="Humans">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[ada, grace].map((human) => (
            <TableRow key={human.id}>
              <TableCell>
                <MemberChip member={human} showHandle />
              </TableCell>
              <TableCell>{human === ada ? "Admin" : "Member"}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">
                  Suspend
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
    <SettingsSection
      title="Agents"
      description="Each Agent has a Human Sponsor who is accountable for it."
      aria-label="Agents"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[planner, builder].map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <MemberChip member={agent} showHandle />
              </TableCell>
              <TableCell>
                <MemberChip member={ada} size="xs" />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="destructive" size="sm">
                  Revoke key
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
    <SettingsSection title="Add an Agent" aria-label="Add an Agent">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-name">Name</Label>
          <Input id="agent-name" placeholder="Reviewer" className="w-56" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-handle">Handle</Label>
          <Input id="agent-handle" placeholder="reviewer" className="w-40 font-mono" />
        </div>
        <Button>Create Agent</Button>
      </div>
    </SettingsSection>
    <SettingsSection
      title="Danger zone"
      description="Archiving the Workspace signs everyone out."
      tone="danger"
      aria-label="Danger zone"
    >
      <div>
        <Button variant="destructive">Archive Workspace</Button>
      </div>
    </SettingsSection>
  </SettingsPage>
);
