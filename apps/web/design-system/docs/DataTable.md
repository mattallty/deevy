The list every screen with a list is built on: a plain table with a sticky header, columns that sort when they have a `sortValue`, group rows that fold, a skeleton while `loading`, and an `Empty` when there is nothing. Rows are 32px (`compact`, default) or 40px (`comfortable`). Render edge-to-edge under a `PageHeader` with a 40px filter bar, never inside a Card. The Issues list's columns are Key (mono, muted), Title with up to two `LabelBadge`s, State (`StateBadge`), Assignee (`MemberChip size="xs"` or "Unassigned"), Updated (mono, right-aligned). The empty state's words say what emptied the list: "No Issues match your filters" with a Clear filters action, "Nothing assigned to you", "No open Issues".

```tsx
<DataTable
  aria-label="Issues"
  columns={columns}
  rows={issues}
  getRowId={(row) => row.key}
  selectedId={selected}
  onOpen={openPeek}
  empty={{ icon: ClipboardList, title: "No Issues match your filters" }}
/>
```
