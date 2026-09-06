The top of every screen: the `h1` a page is named by (20px semibold), one line on what it is for, and the actions that belong to the whole page on the right; children go in a row under the title (filters, tabs, a strip of States). One per page, at the top of the page's flex column, above an edge-to-edge list.

```tsx
<PageHeader title="All Issues" description="Every open Issue in the Workspace." actions={<Button>New Issue</Button>}>
  <IssueFilters … />
</PageHeader>
```
