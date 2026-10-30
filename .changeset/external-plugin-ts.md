---
"create-next-suite": minor
---

External plugins are `plugin.ts` plugins from every source. create-next-suite copies a plugin's files into a snapshot in its cache, named by their content hash, and reads its metadata from `plugin.ts` without running it, so its questions, flags and `--help` show before any of its code runs; metadata that needs running, such as a variable or a call, stops the load with the field it names. A selected plugin runs only once it is trusted, and the metadata it exports has to match what was read. The user configuration keeps the content hash of every trusted address, and a plugin whose content changed is asked about again; without a terminal the run stops unless `--trust` covers it. A plugin may import npm packages it names under `dependencies` in its own `package.json`: once it is trusted, npm installs them into the plugin's cache, with `npm ci` from the lockfile it ships and never with install scripts.
