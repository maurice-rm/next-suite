import { expect, test } from "vitest";

import { resolveDeployTarget } from "../deploy-target";

test("resolveDeployTarget derives a plain user and the /srv/www path", () => {
  expect(resolveDeployTarget("acme", "vps.example.com")).toMatchObject({
    user: "acme",
    path: "/srv/www/acme",
  });
});
