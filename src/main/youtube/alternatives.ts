import type { TrackRef } from '../../shared/types'
import { findAlternative as find } from '../../shared/alternatives'
import './search' // configures the shared YouTube Music client
import log from '../log'

export { SIGN_IN_PATTERN } from '../../shared/alternatives'

export const findAlternative = (track: TrackRef): Promise<TrackRef | null> =>
  find(track, (msg, err) => log.warn(msg, err))
