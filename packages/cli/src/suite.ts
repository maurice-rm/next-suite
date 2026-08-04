#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

import { provisionCommand } from "@/provision";
import { configCommand } from "@/provision/config-command";
import { deprovisionCommand } from "@/provision/deprovision";

import pkg from "../package.json";

const main = defineCommand({
  meta: {
    name: "next-suite",
    version: pkg.version,
    description: "Server tooling for next-suite projects",
  },
  subCommands: {
    provision: provisionCommand,
    deprovision: deprovisionCommand,
    config: configCommand,
  },
});

void runMain(main);
