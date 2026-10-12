import { expect, it } from "vitest";
import { cn } from "./utils";

it("keeps an app font size next to a text color, and still merges conflicting sizes", () => {
  expect(cn("text-caption font-semibold", "text-muted-foreground")).toBe("text-caption font-semibold text-muted-foreground");
  expect(cn("text-body", "text-footnote")).toBe("text-footnote");
  expect(cn("shadow-xs", "shadow-card")).toBe("shadow-card");
});
