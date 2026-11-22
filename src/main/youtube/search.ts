// Desktop wiring for the shared YouTube Music code: electron-log and the yt-dlp fallback.
import { configureYtMusic } from '../../shared/ytmusic'
import { ytdlpSearch } from './ytdlp-json'
import log from '../log'

configureYtMusic({ logger: log, fallbackSearch: ytdlpSearch })

export { search, searchTracks, suggest, album, artist, bigThumb } from '../../shared/ytmusic'
