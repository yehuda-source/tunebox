import type { TuneboxApi } from '../shared/types'

declare global {
  interface Window {
    api: TuneboxApi
  }
}
