import { join } from 'path'
import type { TrackRef } from '../../shared/types'
import { libraryPath as sharedLibraryPath } from '../../shared/organizer'

export { chooseDestination, formatUploadDate } from '../../shared/organizer'

/** The shared layout with this OS's path separator. */
export const libraryPath = (
  libraryDir: string,
  track: TrackRef,
  ext: string,
  date?: string
): string => sharedLibraryPath(libraryDir, track, ext, date, join)
