import { createCn } from "cn/config";

/**
 * shadcn's `cn`, taught the app's own font sizes and shadows from globals.css. Without this,
 * merging `text-body` with a text color drops the size, because an unknown `text-*` class
 * reads as a color.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "footnote", "body", "headline", "title"] }],
      shadow: [{ shadow: ["card", "float"] }],
    },
  },
});
