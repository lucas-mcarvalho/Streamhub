import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, authHeaders, fmtBytes, fmtEta, kindLabel, type Download } from '../api'
import { Bar, btnGhost } from '../components/ui'
import { useToast } from '../components/Toast'

const statusLabel: Record<string, string> = {
  QUEUED: 'Aguardando', DOWNLOADING: 'Baixando', PAUSED: 'Pausado', COMPLETED: 'Concluído', ERROR: 'Erro',
}

/** Lê o stream SSE com fetch para poder enviar o cabeçalho Authorization (EventSource não permite). */
function useDownloadsStream(onData: (d: Download[]) => void) {
  useEffect(() => {
    const ctrl = new AbortController()
    let stopped = false
    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch('/api/downloads/stream', { headers: authHeaders(), signal: ctrl.signal })
          if (!res.body) throw new Error('sem corpo')
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

export default function Downloads() {
  const [list, setList] = useState<Download[] | null>(null)
  const toast = useToast()
  useDownloadsStream(setList)

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn() } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Downloads</h1>
      {list === null && <p className="text-sm text-zinc-500">Conectando…</p>}
      {list?.length === 0 && <p className="text-sm text-zinc-500">Nenhum download.</p>}
      <div className="space-y-3">
        {list?.map((d) => (
          <div key={d.id} className="rounded-lg bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-zinc-400">{kindLabel[d.kind]} · {d.destination}</div>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${d.status === 'ERROR' ? 'bg-red-800' : d.status === 'COMPLETED' ? 'bg-emerald-800' : 'bg-zinc-700'}`}>{statusLabel[d.status]}</span>
            </div>
            <div className="my-3"><Bar percent={d.progress * 100} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>{(d.progress * 100).toFixed(1)}% · {fmtBytes(d.downloadedBytes)} / {fmtBytes(d.sizeBytes)} em disco</span>
              <span>↓ {(d.dlSpeed / 1048576).toFixed(2)} MB/s · ↑ {(d.upSpeed / 1048576).toFixed(2)} MB/s · ETA {d.status === 'DOWNLOADING' ? fmtEta(d.etaSeconds) : '—'}</span>
              <span className="flex gap-2">
                {d.status === 'COMPLETED' && <Link to={`/library?q=${encodeURIComponent(d.title.split(/[.\s]S\d/)[0].replace(/\./g, ' '))}`} className="rounded-md bg-red-600 px-3 py-1.5 text-sm">▶ Assistir</Link>}
                {d.status === 'DOWNLOADING' && <button className={btnGhost} onClick={() => act(() => api(`/downloads/${d.id}/pause`, { method: 'POST' }))}>Pausar</button>}
                {d.status === 'PAUSED' && <button className={btnGhost} onClick={() => act(() => api(`/downloads/${d.id}/resume`, { method: 'POST' }))}>Retomar</button>}
                <button className={btnGhost} onClick={() => { if (confirm('Cancelar e remover da lista? (os arquivos são mantidos)')) act(() => api(`/downloads/${d.id}`, { method: 'DELETE' })) }}>
                  {d.status === 'COMPLETED' ? 'Remover' : 'Cancelar'}</button>
                {d.status !== 'COMPLETED' && <button className={btnGhost} onClick={() => { if (confirm('Cancelar e APAGAR os arquivos baixados?')) act(() => api(`/downloads/${d.id}?deleteFiles=true`, { method: 'DELETE' })) }}>Cancelar e apagar</button>}
              </span>
            </div>
            {d.errorMessage && <p className="mt-2 text-xs text-red-400">{d.errorMessage}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
