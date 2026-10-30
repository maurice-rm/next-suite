import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as tar from 'tar'

import { PluginLoadError } from '../plugin-load-error.ts'

/** Far above any plugin, small enough that a small archive cannot unpack to fill the disk. */
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024

/** A downloaded tarball, where it goes and how many leading path segments it drops. */
export type Extraction = {
  /** The URL the archive came from, named when it cannot be extracted. */
  source: string
  target: string
  strip: number
}

/**
 * Extracts a tarball into a directory: regular files and directories only, nothing outside it,
 * and no more than a plugin can be. The size is checked from each entry's header, before its
 * content is written.
 */
export const extractTarball = async (
  archive: Buffer,
  { source, target, strip }: Extraction,
): Promise<void> => {
  const scratch = await mkdtemp(join(tmpdir(), 'next-suite-archive-'))
  const tooLarge = new PluginLoadError(source, 'the archive is larger than a plugin can be')
  let extractedBytes = 0
  try {
    const file = join(scratch, 'archive.tgz')
    await writeFile(file, archive)
    await mkdir(target, { recursive: true })
    await tar.x({
      file,
      cwd: target,
      strip,
      filter(this: tar.Unpack, _path, entry) {
        if (!(entry instanceof tar.ReadEntry)) {
          return false
        }
        extractedBytes += entry.size
        if (extractedBytes > MAX_EXTRACTED_BYTES) {
          this.abort(tooLarge)
          return false
        }
        return entry.type === 'File' || entry.type === 'Directory'
      },
    })
  } catch (error) {
    throw extractedBytes > MAX_EXTRACTED_BYTES ? tooLarge : error
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
