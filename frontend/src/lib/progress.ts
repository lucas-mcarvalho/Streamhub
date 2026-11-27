// Progresso de reprodução. O navegador guarda uma cópia (para a tela abrir na hora e funcionar sem rede) e o servidor
// guarda a oficial, compartilhada entre aparelhos. Em cada arquivo vale o registro mais recente.
import { useEffect, useState } from 'react'
import { api, progressOf } from '../api'

type Entry = { id: string; pos: number; dur: number; done: boolean; last: number }

const key = (kind: 'pos' | 'dur' | 'last' | 'done', id: string) => `streamhub.${kind}.${id}`

function writeLocal(e: Entry) {
  try {
    if (e.pos > 0) localStorage.setItem(key('pos', e.id), String(e.pos)); else localStorage.removeItem(key('pos', e.id))
    if (e.dur > 0) localStorage.setItem(key('dur', e.id), String(e.dur))
    if (e.done) localStorage.setItem(key('done', e.id), '1'); else localStorage.removeItem(key('done', e.id))
    localStorage.setItem(key('last', e.id), String(e.last))
  } catch { /* armazenamento indisponível */ }
}

const push = (entries: Entry[]) => api('/library/progress', { method: 'PUT', json: entries }).catch(() => { /* fica só neste navegador até a próxima sincronização */ })

/** Registra o progresso de um arquivo, aqui e no servidor. Campos omitidos ficam como estavam. */
export function saveProgress(id: string, change: { pos?: number; dur?: number; done?: boolean }) {
  const cur = progressOf(id)
  const e: Entry = { id, pos: change.pos ?? cur.pos, dur: change.dur || cur.dur, done: change.done ?? cur.done, last: Date.now() }
  writeLocal(e)
  void push([e])
}

function localIds() {
  const ids = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^streamhub\.(?:pos|done|last)\.(.+)$/.exec(localStorage.key(i) ?? '')
      if (m) ids.add(m[1])
    }
  } catch { /* armazenamento indisponível */ }
  return ids
}

let running: Promise<boolean> | undefined

/** Traz do servidor o que for mais novo e envia o que só existe neste navegador. Resolve `true` se algo mudou aqui. */
export function syncProgress(): Promise<boolean> {
  running ??= (async () => {
    const remote = new Map((await api<Entry[]>('/library/progress')).map((e) => [e.id, e]))
    let changed = false
    for (const e of remote.values()) {
      if (e.last > progressOf(e.id).last) { writeLocal(e); changed = true }
    }
    const up: Entry[] = []
    for (const id of localIds()) {
      const p = progressOf(id), r = remote.get(id)
      if (!(p.done || p.pos > 0) && !r) continue
      if (r ? p.last > r.last : true) {
        const e = { id, pos: p.pos, dur: p.dur, done: p.done, last: p.last || Date.now() }
        if (!p.last) writeLocal(e)
        up.push(e)
      }
    }
    if (up.length) await push(up)
    return changed
  })().catch(() => false).finally(() => { setTimeout(() => { running = undefined }, 5000) })
  return running
}

/** Sincroniza ao abrir a tela e a redesenha se o servidor tinha novidades. */
export function useProgressSync() {
  const [, setTick] = useState(0)
  useEffect(() => {
    let dead = false
    void syncProgress().then((changed) => { if (changed && !dead) setTick((t) => t + 1) })
    return () => { dead = true }
  }, [])
}
