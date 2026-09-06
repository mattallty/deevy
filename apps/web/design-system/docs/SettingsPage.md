The frame every Settings page uses: a `PageHeader` (title, one-line description, the page's action on the right), then `SettingsSection`s stacked with a 24px gap. A `SettingsSection` is one concern — a form that adds, a table that lists, a danger zone — as a bordered `bg-card` panel with an optional `h2` and description; `tone="danger"` for what suspends, revokes or archives (those buttons are `variant="destructive"`, while Suspend and Reinstate are `outline`). Give a section an `aria-label` so it is a landmark.

```tsx
<SettingsPage
  title="Members"
  description="Humans and the Agents they sponsor."
  actions={<Button>Invite</Button>}
>
  <SettingsSection title="Humans" aria-label="Humans">
    …
  </SettingsSection>
  <SettingsSection title="Danger zone" tone="danger" aria-label="Danger zone">
    …
  </SettingsSection>
</SettingsPage>
```
