import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authHeaders, type Download } from '../api'

/** Lê o stream SSE com fetch para poder enviar o cabeçalho Authorization (EventSource não permite). */
function useDownloadsStream(onData: (d: Download[]) => void) {
  useEffect(() => {
    const ctrl = new AbortController()
    let stopped = false
    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch('/api/downloads/stream', { headers: authHeaders(), signal: ctrl.signal })
          if (!res.ok || !res.body) throw new Error('sem corpo')
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let i
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i)
              buf = buf.slice(i + 2)
              const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
              if (data) onData(JSON.parse(data))
            }
          }
        } catch { /* reconecta abaixo */ }
        if (!stopped) await new Promise((r) => setTimeout(r, 3000))
      }
    }
    loop()
    return () => { stopped = true; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}


const DownloadsContext = createContext<Download[] | null>(null)

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Download[] | null>(null)
  useDownloadsStream(setList)
  return <DownloadsContext.Provider value={list}>{children}</DownloadsContext.Provider>
}

export const useDownloads = () => useContext(DownloadsContext)
