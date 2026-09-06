The editor for anything a Human writes: an Issue description, a Document, a comment. Rich in the box, markdown in and out (`value` / `onChange` are markdown strings), with an Edit / Source `Tabs` switch, `@mentions` when `mentions` lists Members, and ⌘Enter as the only submit key (`onSubmit`). `mode="block"` is the tall Document editor (`rows`), `mode="inline"` a comment box.

```tsx
<MarkdownEditor
  value={body}
  onChange={setBody}
  placeholder="Write a comment…"
  mode="inline"
  rows={3}
  onSubmit={post}
/>
```
