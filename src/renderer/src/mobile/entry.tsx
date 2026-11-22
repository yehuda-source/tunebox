// Phone entry: install the phone backend as window.api, then start the shared React app.
import { installMobileApi } from './api'

await installMobileApi()
await import('../main')
