// Vercel serverless entry. The TypeScript source is compiled to dist/ by the build command (see vercel.json),
// so Vercel never has to compile TypeScript itself.
import { createApp } from '../dist/src/app.js'

export default createApp()
