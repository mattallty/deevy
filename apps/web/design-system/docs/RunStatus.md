A Run's status as a badge: the Agent hue (rose) while it works, amber while it waits on a Human, green when finished, red when failed, dashed while waiting to start, muted when it has gone quiet. The waiting-on-a-Human badge pulses. Use it on a Run card and in the Runs list of an Issue; `label` overrides the default wording, e.g. "Waiting for approval" on a Gate.

```tsx
<RunStatus status="active" />
<RunStatus status="awaiting_input" label="Waiting for approval" />
```
