---
"create-next-suite": patch
---

Loading external plugins is hardened. A snapshot already in the cache is hashed again before it is used and written anew when its files differ, and a plugin's npm packages are installed anew on every run, so a changed cache never runs under the trust of the real content. A Git clone runs no hook and no filter of the Git configuration, such as Git LFS, follows no submodules and reads no repository around the cache. Git and the GitHub CLI run in a directory of the cache, so on Windows no program of the current directory starts in their place. `next-suite registry add --replace` forgets the trust and content hashes of the registry it replaces, as `registry remove` does. A registry.json whose plugin descriptions hold control or format characters, such as an escape sequence or a bidi override, does not load, and its JSON schema says so.
