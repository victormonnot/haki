import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  let https

  if (mode === 'https') {
    const certificatePath = fileURLToPath(
      new URL('./.cert/local.pem', import.meta.url),
    )
    const keyPath = fileURLToPath(
      new URL('./.cert/local-key.pem', import.meta.url),
    )

    if (!existsSync(certificatePath) || !existsSync(keyPath)) {
      throw new Error(
        'Certificats HTTPS absents. Créez .cert/local.pem et .cert/local-key.pem avec mkcert. Consultez la section « Tester sur iPhone » du README.',
      )
    }

    https = {
      cert: readFileSync(certificatePath),
      key: readFileSync(keyPath),
    }
  }

  return {
    plugins: [react()],
    server: { https },
  }
})
