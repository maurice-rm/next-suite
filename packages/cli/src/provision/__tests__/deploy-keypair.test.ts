import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test, vi } from "vitest";

import { generateKeypair, loadOrCreateKeypair } from "../deploy-keypair";

test("generateKeypair generates a real ed25519 pair and cleans up its temp dir", async () => {
  const { publicKey, privateKey } = await generateKeypair("deploy@next-suite");

  expect(publicKey).toMatch(/^ssh-ed25519 /);
  expect(publicKey.endsWith("deploy@next-suite")).toBe(true);
  expect(privateKey).toContain("PRIVATE KEY");

  const leftover = (await fs.readdir(os.tmpdir())).filter((name) =>
    name.startsWith("ns-ssh-"),
  );
  expect(leftover).toEqual([]);
});

const HOST = "a.example.com";
const OWNER = { host: HOST, name: "acme" };

test("loadOrCreateKeypair reuses persisted key files without calling gen", async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  try {
    await fs.mkdir(path.join(keyDir, HOST));
    await fs.writeFile(path.join(keyDir, HOST, "acme"), "PRIVATE\n", {
      mode: 0o600,
    });
    await fs.writeFile(
      path.join(keyDir, HOST, "acme.pub"),
      "ssh-ed25519 AAA acme\n",
    );
    const generate = () => {
      return Promise.reject(
        new Error("gen must not be called when a key is already persisted"),
      );
    };

    const result = await loadOrCreateKeypair(OWNER, {
      keyDirectory: keyDir,
      generate,
    });

    expect(result).toEqual({
      publicKey: "ssh-ed25519 AAA acme",
      privateKey: "PRIVATE\n",
    });
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true });
  }
});

test("loadOrCreateKeypair refuses to overwrite a private key whose public half is missing", async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  try {
    await fs.mkdir(path.join(keyDir, HOST));
    await fs.writeFile(path.join(keyDir, HOST, "acme"), "PRIVATE\n", {
      mode: 0o600,
    });
    const generate = vi.fn();

    await expect(
      loadOrCreateKeypair(OWNER, { keyDirectory: keyDir, generate }),
    ).rejects.toThrow(/Only half of the deploy keypair exists/);
    expect(generate).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(keyDir, HOST, "acme"), "utf8")).toBe(
      "PRIVATE\n",
    );
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true });
  }
});

test("loadOrCreateKeypair generates and persists a new key (mode 600) when none exists", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  const keyDir = path.join(parent, "nested"); // doesn't exist yet — exercises mkdir
  try {
    const generate = (comment: string) =>
      Promise.resolve({
        publicKey: `ssh-ed25519 AAA ${comment}`,
        privateKey: "GENERATED\n",
      });

    const result = await loadOrCreateKeypair(OWNER, {
      keyDirectory: keyDir,
      generate,
    });

    expect(result.privateKey).toBe("GENERATED\n");
    expect(result.publicKey).toBe("ssh-ed25519 AAA acme@next-suite");

    const stat = await fs.stat(path.join(keyDir, HOST, "acme"));
    expect(stat.mode & 0o777).toBe(0o600);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("loadOrCreateKeypair never shares a key between two servers", async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  try {
    let calls = 0;
    const generate = (comment: string) => {
      calls += 1;
      return Promise.resolve({
        publicKey: `ssh-ed25519 KEY${String(calls)} ${comment}`,
        privateKey: `PRIVATE${String(calls)}\n`,
      });
    };

    const first = await loadOrCreateKeypair(
      { host: "a.example.com", name: "web" },
      { keyDirectory: keyDir, generate },
    );
    const second = await loadOrCreateKeypair(
      { host: "b.example.com", name: "web" },
      { keyDirectory: keyDir, generate },
    );

    expect(calls).toBe(2);
    expect(second.privateKey).not.toBe(first.privateKey);
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true });
  }
});
