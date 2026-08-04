import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  composeProject,
  discoverState,
  removePortEntry,
  runDeprovision,
} from "../deprovision";
import { extractServerName } from "../nginx";
import type { Runner, RunResult } from "../ssh";

const target = { host: "host", user: "root" };
const name = "acme";
const domain = "acme.example.com";
const home = "/srv/www/acme";

const ok = (stdout = ""): RunResult => ({ stdout, stderr: "", exitCode: 0 });

const buildRun = (
  opts: {
    conf?: string;
    certDirExitCode?: number;
    certbotExitCode?: number;
    idExitCode?: number;
    srvExitCode?: number;
    passwdHome?: string;
    portsJson?: string;
    rmConfExitCode?: number;
    rmConfStderr?: string;
    nginxReloadExitCode?: number;
    userdelExitCode?: number;
    userdelStderr?: string;
    gitRemoteExitCode?: number;
  } = {},
) => {
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const run: Runner = async (file, args, runOpts) => {
    calls.push({ file, args, input: runOpts?.input });
    if (file === "git") {
      return { stdout: "", stderr: "", exitCode: opts.gitRemoteExitCode ?? 0 };
    }
    const cmd = args[1];
    if (
      cmd ===
      `if [ -e /etc/nginx/conf.d/${name}.conf ]; then cat /etc/nginx/conf.d/${name}.conf; else exit 3; fi`
    ) {
      return ok(opts.conf ?? "");
    }
    if (cmd?.startsWith(`rm -f /etc/nginx/conf.d/${name}.conf`)) {
      return {
        stdout: "",
        stderr: opts.rmConfStderr ?? "",
        exitCode: opts.rmConfExitCode ?? 0,
      };
    }
    if (cmd?.startsWith("nginx -t &&")) {
      return {
        stdout: "",
        stderr: "",
        exitCode: opts.nginxReloadExitCode ?? 0,
      };
    }
    if (cmd?.startsWith("test -d /etc/letsencrypt/live/")) {
      return { stdout: "", stderr: "", exitCode: opts.certDirExitCode ?? 1 };
    }
    if (cmd?.startsWith("certbot delete")) {
      return { stdout: "", stderr: "", exitCode: opts.certbotExitCode ?? 0 };
    }
    if (cmd === `id -u ${name}`) {
      return { stdout: "", stderr: "", exitCode: opts.idExitCode ?? 1 };
    }
    if (cmd === `test -d /srv/www/${name}`) {
      return { stdout: "", stderr: "", exitCode: opts.srvExitCode ?? 1 };
    }
    if (cmd === `getent passwd ${name} | cut -d: -f6`) {
      return ok(opts.passwdHome !== undefined ? `${opts.passwdHome}\n` : "");
    }
    if (cmd === `userdel -r ${name}`) {
      return {
        stdout: "",
        stderr: opts.userdelStderr ?? "",
        exitCode: opts.userdelExitCode ?? 0,
      };
    }
    if (
      cmd ===
      "if [ -e /srv/ports.json ]; then cat /srv/ports.json; else exit 3; fi"
    ) {
      return ok(opts.portsJson ?? "");
    }
    return ok("");
  };
  return { run, calls };
};

const withXdg = async <T>(fn: (keysDir: string) => Promise<T>): Promise<T> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ns-depro-"));
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = root;
  const keysDir = path.join(root, "next-suite", "keys");
  await fs.mkdir(keysDir, { recursive: true });
  try {
    return await fn(keysDir);
  } finally {
    process.env.XDG_CONFIG_HOME = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
};

test("extractServerName returns the first server_name value", () => {
  const conf = "server {\n    server_name acme.example.com;\n}\n";
  expect(extractServerName(conf)).toBe("acme.example.com");
});

test("extractServerName picks the first of multiple server_name directives", () => {
  const conf =
    "server_name first.example.com;\nserver_name second.example.com;";
  expect(extractServerName(conf)).toBe("first.example.com");
});

test("extractServerName returns undefined when there is no server_name", () => {
  expect(extractServerName("server {\n    listen 80;\n}\n")).toBeUndefined();
});

test("removePortEntry removes only the named key", () => {
  const registry = JSON.stringify({ acme: 8100, other: 8101 });
  expect(removePortEntry(registry, "acme")).toBe(
    `${JSON.stringify({ other: 8101 }, null, 2)}\n`,
  );
});

test("removePortEntry tolerates an empty registry", () => {
  expect(removePortEntry("", "acme")).toBe("{}\n");
});

test("removePortEntry is a no-op when the key is already absent", () => {
  const registry = JSON.stringify({ other: 8101 });
  expect(removePortEntry(registry, "acme")).toBe(
    `${JSON.stringify({ other: 8101 }, null, 2)}\n`,
  );
});

test("discoverState reports everything present", async () => {
  await withXdg(async (keysDir) => {
    await fs.writeFile(path.join(keysDir, name), "PRIVATE\n");
    await fs.writeFile(path.join(keysDir, `${name}.pub`), "ssh-ed25519 AAA\n");

    const { run } = buildRun({
      conf: `server_name ${domain};\n`,
      certDirExitCode: 0,
      idExitCode: 0,
      srvExitCode: 0,
      portsJson: JSON.stringify({ acme: 8100 }),
    });

    expect(await discoverState(name, target, run)).toEqual({
      confExists: true,
      domain,
      certExists: true,
      userExists: true,
      srvExists: true,
      portEntry: true,
      localKeys: true,
    });
  });
});

test("discoverState reports everything absent and never probes the cert dir without a known domain", async () => {
  await withXdg(async () => {
    const { run, calls } = buildRun();

    expect(await discoverState(name, target, run)).toEqual({
      confExists: false,
      domain: undefined,
      certExists: false,
      userExists: false,
      srvExists: false,
      portEntry: false,
      localKeys: false,
    });
    expect(
      calls.some((c) =>
        c.args[1]?.startsWith("test -d /etc/letsencrypt/live/"),
      ),
    ).toBe(false);
  });
});

test("discoverState rejects with Cannot reach when the host is unreachable, and runs no discovery probes", async () => {
  const calls: { args: string[] }[] = [];
  const run: Runner = async (_file, args) => {
    calls.push({ args });
    return { stdout: "", stderr: "no route to host", exitCode: 1 };
  };

  await expect(discoverState(name, target, run)).rejects.toThrow(
    /Cannot reach root@host/,
  );
  expect(calls).toEqual([{ args: ["root@host", "true"] }]);
});

test("discoverState treats an invalid server_name as no domain — no cert probe issued", async () => {
  await withXdg(async () => {
    const { run, calls } = buildRun({ conf: "server_name x;rm -rf /tmp;\n" });

    const state = await discoverState(name, target, run);

    expect(state.domain).toBeUndefined();
    expect(state.certExists).toBe(false);
    expect(
      calls.some((c) =>
        c.args[1]?.startsWith("test -d /etc/letsencrypt/live/"),
      ),
    ).toBe(false);
  });
});

test("runDeprovision (server) removes nginx, cert, user, srv, and ports in that order", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    certbotExitCode: 0,
    passwdHome: home,
    portsJson: JSON.stringify({ acme: 8100, other: 8101 }),
  });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  const nginxIdx = calls.findIndex(
    (c) =>
      c.args[1]?.startsWith(`rm -f /etc/nginx/conf.d/${name}.conf`) ?? false,
  );
  const certIdx = calls.findIndex((c) =>
    c.args[1]?.startsWith("certbot delete"),
  );
  const getentIdx = calls.findIndex(
    (c) => c.args[1] === `getent passwd ${name} | cut -d: -f6`,
  );
  const userdelIdx = calls.findIndex((c) => c.args[1] === `userdel -r ${name}`);
  const srvIdx = calls.findIndex((c) => c.input?.includes(`rm -rf ${home}`));
  const portsReadIdx = calls.findIndex(
    (c) =>
      c.args[1] ===
      "if [ -e /srv/ports.json ]; then cat /srv/ports.json; else exit 3; fi",
  );
  const portsUploadIdx = calls.findIndex(
    (c) => c.args[1] === "cat > /srv/ports.json.tmp",
  );

  expect(nginxIdx).toBeGreaterThanOrEqual(0);
  expect(certIdx).toBeGreaterThan(nginxIdx);
  expect(getentIdx).toBeGreaterThan(certIdx);
  expect(userdelIdx).toBeGreaterThan(getentIdx);
  expect(srvIdx).toBeGreaterThan(userdelIdx);
  expect(portsReadIdx).toBeGreaterThan(srvIdx);
  expect(portsUploadIdx).toBeGreaterThan(portsReadIdx);
  expect(log.join("\n")).toContain("removed");
  expect(log.join("\n")).toContain(
    'docker compose -p acme down -v" removes them and the database volume',
  );
});

test("the teardown note names the compose project, which drops a dot the project name may carry", () => {
  expect(composeProject("acme")).toBe("acme");
  expect(composeProject("my.app")).toBe("myapp");
});

test("onStepStart fires before each teardown phase, paired ahead of its onStep completion", async () => {
  const { run } = buildRun({
    conf: `server_name ${domain};\n`,
    certbotExitCode: 0,
    passwdHome: home,
    portsJson: JSON.stringify({ acme: 8100 }),
  });
  const events: string[] = [];

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    {
      run,
      onStepStart: (label) => events.push(`start:${label}`),
      onStep: (line) => events.push(`step:${line}`),
    },
  );

  const idx = (needle: string) => events.findIndex((e) => e.includes(needle));

  expect(idx("start:Removing nginx config…")).toBeLessThan(idx("step:nginx:"));
  expect(idx("start:Removing TLS certificate…")).toBeLessThan(
    idx("step:TLS: certificate"),
  );
  expect(idx("start:Removing server user…")).toBeLessThan(
    idx("step:user: acme removed"),
  );
  expect(idx("start:Removing app directory…")).toBeLessThan(idx("step:srv:"));
  expect(idx("start:Updating port registry…")).toBeLessThan(
    idx("step:ports: registry entry removed"),
  );
});

test("a still-running spinner from a step with no completion (no user to remove) does not stop onStepStart from firing for the next phase", async () => {
  const { run } = buildRun({ passwdHome: undefined });
  const starts: string[] = [];

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run, onStepStart: (label) => starts.push(label) },
  );

  expect(starts).toContain("Removing server user…");
  expect(starts).toContain("Removing app directory…");
});

test("a non-zero certbot delete is tolerated — the run continues past it", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    certbotExitCode: 1,
    passwdHome: home,
  });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(calls.some((c) => c.args[1] === `userdel -r ${name}`)).toBe(true);
  expect(log.join("\n")).toMatch(/no certificate to remove/);
});

test("nginx -t / reload failing (e.g. someone else's broken conf) is tolerated — the run continues to user/srv/ports", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    nginxReloadExitCode: 1,
    passwdHome: home,
    portsJson: JSON.stringify({ acme: 8100 }),
  });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(log.join("\n")).toContain("reload failed — check nginx -t manually");
  expect(calls.some((c) => c.args[1] === `userdel -r ${name}`)).toBe(true);
  expect(calls.some((c) => c.input?.includes(`rm -rf ${home}`))).toBe(true);
  expect(calls.some((c) => c.args[1] === "cat > /srv/ports.json.tmp")).toBe(
    true,
  );
});

test("a failed nginx conf removal is reported as NOT removed, and the teardown still continues to later steps", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    rmConfExitCode: 1,
    rmConfStderr:
      "rm: cannot remove '/etc/nginx/conf.d/acme.conf': Permission denied",
    certbotExitCode: 0,
    passwdHome: home,
    portsJson: JSON.stringify({ acme: 8100 }),
  });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(log.join("\n")).toContain(
    "nginx: /etc/nginx/conf.d/acme.conf NOT removed (rm: cannot remove '/etc/nginx/conf.d/acme.conf': Permission denied)",
  );
  expect(calls.some((c) => c.args[1] === `userdel -r ${name}`)).toBe(true);
  expect(calls.some((c) => c.args[1] === "cat > /srv/ports.json.tmp")).toBe(
    true,
  );
});

test("userdel failing (e.g. live processes) is tolerated — the run continues to srv/ports", async () => {
  const { run, calls } = buildRun({
    passwdHome: home,
    userdelExitCode: 1,
    userdelStderr: "userdel: user acme is currently used by process 123",
    portsJson: JSON.stringify({ acme: 8100 }),
  });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(log.join("\n")).toContain(
    "user: acme not removed (userdel: user acme",
  );
  expect(calls.some((c) => c.input?.includes(`rm -rf ${home}`))).toBe(true);
  expect(calls.some((c) => c.args[1] === "cat > /srv/ports.json.tmp")).toBe(
    true,
  );
});

test("ports.json is left untouched when there is no entry for this project", async () => {
  const { run, calls } = buildRun({
    portsJson: JSON.stringify({ other: 8101 }),
  });
  const events: string[] = [];

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    {
      run,
      onStepStart: (label) => events.push(`start:${label}`),
      onStep: (line) => events.push(`step:${line}`),
    },
  );

  expect(calls.some((c) => c.args[1] === "cat > /srv/ports.json.tmp")).toBe(
    false,
  );

  const portsStart = events.indexOf("start:Updating port registry…");
  expect(events[portsStart + 1]).toBe(
    "step:ports: no registry entry to remove",
  );
  const noteIdx = events.findIndex((e) => e.includes("Note: containers for"));
  expect(noteIdx).toBeGreaterThan(portsStart + 1);
});

test("a user with a foreign home is left alone — neither userdel nor rm -rf is issued", async () => {
  const { run, calls } = buildRun({ passwdHome: "/home/someoneelse" });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(calls.some((c) => c.args[1]?.includes("userdel"))).toBe(false);
  expect(calls.some((c) => c.input?.includes(`rm -rf ${home}`))).toBe(false);
  expect(log.join("\n")).toMatch(/someoneelse/);
  expect(log.join("\n")).toContain(`srv: ${home} left alone`);
});

test("an already-absent user is tolerated without issuing userdel", async () => {
  const { run, calls } = buildRun({ passwdHome: undefined });

  await expect(
    runDeprovision(
      name,
      target,
      { server: true, github: false, localKeys: false },
      { run },
    ),
  ).resolves.toBeDefined();
  expect(calls.some((c) => c.args[1]?.includes("userdel"))).toBe(false);
  expect(calls.some((c) => c.input?.includes(`rm -rf ${home}`))).toBe(true);
});

test("--domain fills in for cert deletion when the conf is already gone", async () => {
  const { run, calls } = buildRun({ conf: "", certbotExitCode: 0 });

  await runDeprovision(
    name,
    target,
    { domain, server: true, github: false, localKeys: false },
    { run },
  );

  expect(
    calls.some((c) => c.args[1] === `certbot delete --cert-name ${domain} -n`),
  ).toBe(true);
});

test("a malicious server_name is treated as no domain — no certbot probe/delete issued", async () => {
  const { run, calls } = buildRun({ conf: "server_name x;rm -rf /tmp;\n" });

  const { log } = await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  expect(calls.some((c) => c.args[1]?.startsWith("certbot delete"))).toBe(
    false,
  );
  expect(log.join("\n")).toMatch(/ignoring invalid server_name/);
});

test("an invalid --domain flag rejects before any remote call is made", async () => {
  const { run, calls } = buildRun();

  await expect(
    runDeprovision(
      name,
      target,
      {
        domain: "x;rm -rf /tmp",
        server: true,
        github: false,
        localKeys: false,
      },
      { run },
    ),
  ).rejects.toThrow(/Invalid domain: x;rm -rf \/tmp/);
  expect(calls).toEqual([]);
});

test("server=false skips every remote removal step", async () => {
  const { run, calls } = buildRun();

  await runDeprovision(
    name,
    target,
    { server: false, github: false, localKeys: false },
    { run },
  );

  expect(calls).toEqual([]);
});

test("no GitHub remote: the whole GitHub group is skipped with a warning, gh is never called", async () => {
  const { run } = buildRun({ gitRemoteExitCode: 1 });
  let ghCalls = 0;
  const gh = async (): Promise<void> => {
    ghCalls += 1;
  };

  const { log } = await runDeprovision(
    name,
    target,
    { server: false, github: true, localKeys: false },
    { run, gh },
  );

  expect(ghCalls).toBe(0);
  expect(log.join("\n")).toContain("no GitHub remote — secrets NOT removed");
});

test("onStepStart fires once before the GitHub group, ahead of the first delete", async () => {
  const { run } = buildRun();
  const gh = async (): Promise<void> => {};
  const starts: string[] = [];
  const stepped: string[] = [];

  await runDeprovision(
    name,
    target,
    { server: false, github: true, localKeys: false },
    {
      run,
      gh,
      onStepStart: (label) => starts.push(label),
      onStep: (line) => stepped.push(line),
    },
  );

  expect(starts).toEqual(["Removing GitHub secrets…"]);
  expect(stepped[0]).toContain("GitHub: secret DEPLOY_SSH_KEY deleted");
});

test("a resolved repo pins every gh delete, so another repository's secrets stay untouched", async () => {
  const { run } = buildRun();
  const ghCalls: string[][] = [];
  const gh = async (args: string[]): Promise<void> => {
    ghCalls.push(args);
  };

  await runDeprovision(
    name,
    target,
    { server: false, github: true, localKeys: false, repo: "acme-org/acme" },
    { run, gh },
  );

  const deletes = ghCalls.filter((c) => c[1] === "delete");
  expect(deletes).toHaveLength(5);
  for (const c of deletes) {
    expect(c.slice(-2)).toEqual(["--repo", "acme-org/acme"]);
  }
});

test("gh deletes cover all five entries and are tolerant of not-found, after a passing auth check", async () => {
  const { run } = buildRun();
  const ghCalls: string[][] = [];
  const gh = async (args: string[]): Promise<void> => {
    ghCalls.push(args);
    if (args[2] === "DEPLOY_SSH_HOST") throw new Error("gh: secret not found");
  };

  const { log } = await runDeprovision(
    name,
    target,
    { server: false, github: true, localKeys: false },
    { run, gh },
  );

  expect(ghCalls[0]).toEqual(["auth", "status"]);
  expect(ghCalls.slice(1).map((c) => c[2])).toEqual([
    "DEPLOY_SSH_KEY",
    "DEPLOY_SSH_HOST",
    "DEPLOY_SSH_USER",
    "DEPLOY_PATH",
    "NEXT_PUBLIC_APP_URL",
  ]);
  expect(log.join("\n")).toContain(
    "secret DEPLOY_SSH_HOST not deleted — gh: secret not found",
  );
});

test("gh not authenticated: the whole GitHub group is skipped with a warning, no deletes attempted", async () => {
  const { run } = buildRun();
  const ghCalls: string[][] = [];
  const gh = async (args: string[]): Promise<void> => {
    ghCalls.push(args);
    throw new Error("gh: not logged in");
  };

  const { log } = await runDeprovision(
    name,
    target,
    { server: false, github: true, localKeys: false },
    { run, gh },
  );

  expect(ghCalls).toEqual([["auth", "status"]]);
  expect(log.join("\n")).toContain(
    "gh not authenticated — GitHub secrets NOT removed",
  );
});

test("github=false never calls gh", async () => {
  const { run } = buildRun();
  let ghCalls = 0;
  const gh = async (): Promise<void> => {
    ghCalls += 1;
  };

  await runDeprovision(
    name,
    target,
    { server: false, github: false, localKeys: false },
    { run, gh },
  );

  expect(ghCalls).toBe(0);
});

test("localKeys removes both key files when chosen, and leaves them when not", async () => {
  await withXdg(async (keysDir) => {
    const keyFile = path.join(keysDir, name);
    await fs.writeFile(keyFile, "PRIVATE\n");
    await fs.writeFile(`${keyFile}.pub`, "ssh-ed25519 AAA\n");

    const { run } = buildRun();
    const { log } = await runDeprovision(
      name,
      target,
      { server: false, github: false, localKeys: true },
      { run },
    );

    await expect(fs.access(keyFile)).rejects.toThrow();
    await expect(fs.access(`${keyFile}.pub`)).rejects.toThrow();
    expect(log.join("\n")).toContain("local keys");
  });
});

test("server teardown deletes the project's nginx logs and re-reads the jails", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    passwdHome: home,
    portsJson: "{}",
  });

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  const rm = calls.find((c) =>
    c.args[1]?.startsWith(`rm -f /etc/nginx/conf.d/${name}.conf`),
  )?.args[1];
  expect(rm).toContain(`/var/log/nginx/${domain}.access.log*`);
  expect(rm).toContain(`/var/log/nginx/${domain}.error.log*`);

  const reload = calls.find((c) => c.args[1]?.startsWith("nginx -t &&"))
    ?.args[1];
  expect(reload).toContain("nginx-limit-req nginx-botsearch");
  expect(reload).toContain("exit $rc");
});

test("without a known domain no log path is guessed", async () => {
  const { run, calls } = buildRun({
    conf: "",
    passwdHome: home,
    portsJson: "{}",
  });

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  const rm = calls.find((c) =>
    c.args[1]?.startsWith(`rm -f /etc/nginx/conf.d/${name}.conf`),
  )?.args[1];
  expect(rm).toBe(
    `rm -f /etc/nginx/conf.d/${name}.conf /etc/nginx/conf.d/${name}.conf.prev`,
  );
});

test("the rotated backup goes with the conf — provision leaves it behind on every run", async () => {
  const { run, calls } = buildRun({
    conf: `server_name ${domain};\n`,
    passwdHome: home,
    portsJson: "{}",
  });

  await runDeprovision(
    name,
    target,
    { server: true, github: false, localKeys: false },
    { run },
  );

  const rm = calls.find((c) =>
    c.args[1]?.startsWith(`rm -f /etc/nginx/conf.d/${name}.conf`),
  )?.args[1];
  expect(rm).toContain(`/etc/nginx/conf.d/${name}.conf.prev`);
});
