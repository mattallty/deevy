A State of a Project's workflow: a dot coloured by its category (`backlog` gray, `active` indigo, `done` green), or, when the State is a Gate, an amber diamond. The diamond is the one warm colour on a screen, so a Gate jumps. Use it in table cells, group headers, the side peek, the Issue rail and a Board column header. Never colour a State any other way.

```tsx
<StateBadge state={{ name: "Review", isGate: true, category: "active" }} />
<StateBadge state={{ name: "In progress", isGate: false, category: "active" }} size="md" />
```
