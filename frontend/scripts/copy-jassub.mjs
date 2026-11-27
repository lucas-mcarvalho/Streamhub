// Copia o worker, o WASM e a fonte padrão do JASSUB (renderizador de legendas .ass) para public/jassub,
// de onde o navegador os carrega sem passar pelas transformações do Vite.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'jassub', 'dist')
const to = join(root, 'public', 'jassub')
if (!existsSync(from)) {
  console.warn('jassub não instalado; legendas .ass usarão o modo simples')
  process.exit(0)
}
mkdirSync(to, { recursive: true })
for (const f of ['jassub-worker.js', 'jassub-worker.wasm', 'jassub-worker-modern.wasm', 'jassub-worker.wasm.js', 'default.woff2']) {
  copyFileSync(join(from, f), join(to, f))
}
