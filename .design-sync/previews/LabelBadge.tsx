import { LABEL_COLORS, LabelBadge } from "@deevy/design-system";
import { labels } from "./lib/fixtures";

/** On rows and cards: a quiet badge, the scope pill in the Label's colour. */
export const Outline = () => (
  <div className="flex flex-wrap items-center gap-2">
    <LabelBadge label={labels.epic} />
    <LabelBadge label={labels.backend} />
    <LabelBadge label={labels.bug} />
    <LabelBadge label={labels.docs} />
  </div>
);

/** In Settings: the whole badge in the Label's colour, the scope pill knocked out. */
export const Solid = () => (
  <div className="flex flex-wrap items-center gap-2">
    <LabelBadge label={labels.epic} variant="solid" />
    <LabelBadge label={labels.backend} variant="solid" />
    <LabelBadge label={labels.bug} variant="solid" />
    <LabelBadge label={labels.docs} variant="solid" />
  </div>
);

/** The eight colours a Label may take, and no other. */
export const Palette = () => (
  <div className="flex flex-wrap items-center gap-2">
    {LABEL_COLORS.map((color, index) => (
      <LabelBadge
        key={color}
        variant="solid"
        label={{
          scope: null,
          name: ["sky", "rose", "amber", "indigo", "green", "red", "slate", "violet"][index]!,
          color,
        }}
      />
    ))}
  </div>
);
