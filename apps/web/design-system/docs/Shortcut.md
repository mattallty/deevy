A keyboard shortcut drawn beside the thing it triggers, in `Kbd` keys: `mod+k` is one combination (⌘ K on a Mac), `g i` a chord of two keys in sequence ("G then I"). It is decoration (`aria-hidden`), so put it beside a label, never instead of one: in a menu item's trailing slot, a tooltip, a command palette row, the shortcuts sheet.

```tsx
<Button variant="outline">Search <Shortcut keys="mod+k" /></Button>
<Shortcut keys="g i" />
```
