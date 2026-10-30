import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as tar from 'tar'

/** Extracts a tarball into a directory: regular files and directories only, nothing outside it. */
export const extractTarball = async (
  archive: Buffer,
  target: string,
  strip: number,
): Promise<void> => {
  const scratch = await mkdtemp(join(tmpdir(), 'next-suite-archive-'))
  try {
    const file = join(scratch, 'archive.tgz')
    await writeFile(file, archive)
    await mkdir(target, { recursive: true })
    await tar.x({
      file,
      cwd: target,
      strip,
      filter: (_path, entry) =>
        'type' in entry && (entry.type === 'File' || entry.type === 'Directory'),
    })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
