A Label as a badge: the scope as a small coloured pill inside the badge, then the name — `[[epic] Agent loop]`, never `epic: Agent loop` as text. `outline` (default) keeps the badge quiet and gives only the scope pill the colour, for Issue rows, cards and the side peek, so a row with three Labels stays readable; `solid` paints the whole badge in the Label's colour, for the Settings › Labels list. Colours come from the eight `LABEL_COLORS` (sky, rose, amber, indigo, green, red, slate, violet), never a free colour. `LabelText` is the inner content when you need it outside a Badge.

```tsx
<LabelBadge label={{ scope: "epic", name: "Agent loop", color: "#6265ed" }} />
<LabelBadge label={{ scope: null, name: "backend", color: "#008fba" }} variant="solid" />
```
