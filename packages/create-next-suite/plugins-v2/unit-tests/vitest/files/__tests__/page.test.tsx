import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("the home page shows the project name", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: "next-suite-app" })).toBeDefined();
});
