import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Button } from "./button";

// Smoke test for the component project: jsdom, Testing Library, and the @/ alias.
it("renders and handles clicks", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Save draft</Button>);

  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

  expect(onClick).toHaveBeenCalledOnce();
});
