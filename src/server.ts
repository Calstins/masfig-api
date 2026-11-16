import { createApp } from './app.js'
import { config } from './config.js'

createApp().listen(config.port, () => {
  console.log(`masfig-api listening on :${config.port} (${config.env})`)
})
