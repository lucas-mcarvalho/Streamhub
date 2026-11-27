import { useEffect, useState } from 'react'
import { api, fmtBytes, kindLabel, type Discovery, type Disk, type Location, type MediaFolder, type Root } from '../api'
import { Bar, btn, btnGhost, input, Modal, Notice, PageTitle, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAsync } from '../hooks'

function AddDisk({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const disks = useAsync(() => api<Disk[]>('/storage/disks'), [])
  const [pick, setPick] = useState<Disk>()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('GENERAL')
  const [sub, setSub] = useState('StreamHub')
  const [makeDefault, setMakeDefault] = useState(true)
  const [busy, setBusy] = useState(false)

  const choose = (d: Disk) => { setPick(d); setName(d.name) }
  const save = async () => {
    if (!pick) return
    setBusy(true)
    try {
      const loc = await api<Location>('/storage/locations', {
        method: 'POST',
        json: { name, rootIndex: pick.rootIndex, relativePath: `${pick.relativePath}/${sub.replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, ''), kind, makeDefault, createIfMissing: true },
      })
      await api(`/storage/locations/${loc.id}/test`, { method: 'POST' })
      toast('Disco adicionado e pronto para downloads'); onDone()
    } catch (e) { toast((e as Error).message, 'err'); setBusy(false) }
  }

  return (
    <Modal title="Adicionar disco" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-400">Discos conectados ao computador do servidor (SSD/HD externo, pen drive). Conectou agora? Toque em “Atualizar”.</p>
      {disks.loading ? <Spinner /> : (
        <ul className="mb-3 space-y-2">
          {disks.data?.length === 0 && <li className="rounded border border-line px-3 py-3 text-sm text-zinc-400">Nenhum disco detectado. Monte o disco no sistema (ele precisa aparecer no gerenciador de arquivos) e atualize. Se o problema continuar, confira DISKS_DIR no <span className="font-mono">.env</span>.</li>}
          {disks.data?.map((d) => (
            <li key={d.name}>
              <button disabled={!d.writable} onClick={() => choose(d)}
                className={`w-full rounded-lg border p-3 text-left transition disabled:opacity-50 ${pick?.name === d.name ? 'border-accent-500 bg-accent-500/10' : 'border-line hover:border-accent-500/50'}`}>
                <div className="flex justify-between gap-2 text-sm font-medium"><span className="truncate">💽 {d.name}</span><span className="shrink-0 text-xs text-zinc-400">{d.fsType}</span></div>
                <Bar percent={d.usage.total ? (d.usage.used / d.usage.total) * 100 : 0} />
                <div className="mt-1 text-xs text-zinc-400">{fmtBytes(d.usage.free)} livres de {fmtBytes(d.usage.total)}{!d.writable && ' · sem permissão de gravação (somente leitura)'}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className={btnGhost + ' mb-4'} onClick={disks.reload}>Atualizar</button>
      {pick && (
        <>
          <input className={input + ' mb-3'} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: SSD externo)" />
          <label className="text-xs text-zinc-400">Pasta dentro do disco (criada se não existir)</label>
          <input className={input + ' mb-3'} value={sub} onChange={(e) => setSub(e.target.value)} placeholder="StreamHub" />
          <select className={input + ' mb-3'} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(kindLabel).map(([k, v]) => <option key={k} value={k}>{k === 'GENERAL' ? 'Geral (padrão de downloads)' : v}</option>)}
          </select>
          <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Usar como padrão deste tipo</label>
          <button className={btn} disabled={!name.trim() || busy} onClick={save}>{busy ? 'Adicionando…' : 'Adicionar disco'}</button>
        </>
      )}
    </Modal>
  )
}

/** Discos conectados e as pastas de mídia (Animes, Filmes, Séries) achadas em cada um, prontas para a biblioteca. */
function MediaDisks({ onChanged }: { onChanged: () => void }) {
  const toast = useToast()
  const rep = useAsync(() => api<Discovery>('/storage/discover'), [])
  const [kinds, setKinds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const kindOf = (f: MediaFolder) => kinds[f.path] ?? f.kind
  const register = async (folders: MediaFolder[]) => {
    setBusy(true)
    try {
      const done = await api<Location[]>('/storage/discover/register', {
        method: 'POST', json: folders.map((f) => ({ rootIndex: f.rootIndex, relativePath: f.relativePath, kind: kindOf(f) })),
      })
      toast(done.length === 1 ? `"${done[0].name}" adicionada à biblioteca` : `${done.length} pastas adicionadas à biblioteca`)
      rep.reload(); onChanged()
    } catch (e) { toast((e as Error).message, 'err'); rep.reload() }
    setBusy(false)
  }
  const setAuto = async (enabled: boolean) => {
    try { await api('/storage/discover/auto', { method: 'PUT', json: { enabled } }); rep.reload(); if (enabled) onChanged() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const data = rep.data
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Discos e pastas de mídia</h2>
        <button className={btnGhost} onClick={rep.reload} disabled={rep.loading}>Atualizar</button>
      </div>
      {rep.error && <Notice text={rep.error} />}
      {rep.loading && !data ? <Spinner /> : data && (
        <>
          <label className="mb-3 flex items-start gap-2 rounded-lg bg-surface p-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={data.autoRegister} onChange={(e) => setAuto(e.target.checked)} />
            <span>Adicionar sozinho as pastas de mídia de discos conectados
              <span className="block text-xs text-zinc-400">Confere a cada minuto. Pastas que você remover da lista não voltam.</span></span>
          </label>
          {data.warnings.map((w) => (
            <p key={w.code} className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">⚠ {w.message}</p>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            {data.sources.map((src) => {
              const pending = src.folders.filter((f) => !f.locationId)
              return (
                <div key={src.path} className="rounded-lg bg-surface p-4">
                  <div className="mb-2 flex justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{src.disk ? '💽' : '📁'} {src.name}</span>
                    <span className="shrink-0 text-xs text-zinc-400">{src.fsType}</span>
                  </div>
                  <Bar percent={src.usage.total ? (src.usage.used / src.usage.total) * 100 : 0} />
                  <div className="mt-1 text-xs text-zinc-400">{fmtBytes(src.usage.free)} livres de {fmtBytes(src.usage.total)}{!src.writable && ' · somente leitura'}</div>
                  <ul className="mt-3 space-y-1.5">
                    {src.folders.length === 0 && <li className="text-xs text-zinc-500">Nenhuma pasta Animes, Filmes ou Séries encontrada. Use “Registrar pasta” para escolher outra.</li>}
                    {src.folders.map((f) => (
                      <li key={f.path} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300" title={f.path}>{f.relativePath}</span>
                        {f.locationId ? <span className="shrink-0 text-xs text-emerald-400">✓ na biblioteca · {kindLabel[f.kind]}</span> : (
                          <>
                            <select className="shrink-0 rounded border border-line bg-surface2 px-1.5 py-1 text-xs" value={kindOf(f)}
                              onChange={(e) => setKinds({ ...kinds, [f.path]: e.target.value })}>
                              {['ANIME', 'MOVIE', 'SERIES', 'GENERAL'].map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
                            </select>
                            <button className={btnGhost + ' shrink-0 !px-2 !py-1 text-xs'} disabled={busy} onClick={() => register([f])}>Adicionar</button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {pending.length > 1 && <button className={btn + ' mt-3 w-full'} disabled={busy} onClick={() => register(pending)}>Adicionar todas ({pending.length})</button>}
                  {pending.some((f) => f.ignored) && <p className="mt-2 text-xs text-zinc-500">Pastas removidas antes não são adicionadas sozinhas, só por aqui.</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

type Dir = { name: string; relativePath: string }

function AddModal({ roots, onClose, onDone }: { roots: Root[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [root, setRoot] = useState(roots[0]?.index ?? 0)
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<Dir[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState('GENERAL')
  const [makeDefault, setMakeDefault] = useState(false)

  const browse = async (r: number, p: string) => {
    try { setDirs(await api<Dir[]>(`/storage/browse?root=${r}&path=${encodeURIComponent(p)}`)); setRoot(r); setPath(p) }
    catch (e) { toast((e as Error).message, 'err') }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { browse(root, '') }, [])

  const save = async () => {
    try {
      await api('/storage/locations', { method: 'POST', json: { name, rootIndex: root, relativePath: path, kind, makeDefault, createIfMissing: true } })
      toast('Local cadastrado'); onDone()
    } catch (e) { toast((e as Error).message, 'err') }
  }
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  return (
    <Modal title="Registrar pasta de armazenamento" onClose={onClose}>
      <p className="mb-2 text-xs text-zinc-400">Apenas pastas dentro das raízes autorizadas do servidor podem ser escolhidas.</p>
      <select className={input + ' mb-2'} value={root} onChange={(e) => browse(Number(e.target.value), '')}>
        {roots.map((r) => <option key={r.index} value={r.index}>{r.path} — livre {fmtBytes(r.usage.free)}</option>)}
      </select>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button className={btnGhost} disabled={!path} onClick={() => browse(root, parent)}>↑</button>
        <span className="truncate text-zinc-300">/{path}</span>
      </div>
      <ul className="mb-3 max-h-40 overflow-auto rounded border border-line text-sm">
        {dirs.length === 0 && <li className="px-3 py-2 text-zinc-500">Sem subpastas</li>}
        {dirs.map((d) => <li key={d.relativePath} className="cursor-pointer px-3 py-1.5 hover:bg-surface2" onClick={() => browse(root, d.relativePath)}>📁 {d.name}</li>)}
      </ul>
      <label className="text-xs text-zinc-400">Ou digite uma subpasta (será criada se não existir)</label>
      <input className={input + ' mb-3'} value={path} onChange={(e) => setPath(e.target.value)} placeholder="ex.: Filmes/4K" />
      <input className={input + ' mb-3'} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: HD Externo - Filmes)" />
      <select className={input + ' mb-3'} value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(kindLabel).map(([k, v]) => <option key={k} value={k}>{k === 'GENERAL' ? 'Geral (padrão de downloads)' : v}</option>)}
      </select>
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Definir como padrão deste tipo</label>
      <button className={btn} disabled={!name.trim()} onClick={save}>Registrar</button>
    </Modal>
  )
}

export default function Storage() {
  const toast = useToast()
  const locs = useAsync(() => api<Location[]>('/storage/locations'), [])
  const roots = useAsync(() => api<Root[]>('/storage/roots'), [])
  const [adding, setAdding] = useState(false)
  const [addingDisk, setAddingDisk] = useState(false)
  const [discoverKey, setDiscoverKey] = useState(0)   // remonta o painel de discos quando a lista de pastas muda por fora

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); locs.reload(); setDiscoverKey((k) => k + 1) } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle sub="Discos e pastas do servidor">Armazenamento</PageTitle>
        <div className="flex gap-2">
          <button className={btn} onClick={() => setAddingDisk(true)}>+ Adicionar disco</button>
          <button className={btnGhost} onClick={() => setAdding(true)} disabled={!roots.data?.length}>Registrar pasta</button>
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-400">Os discos e pastas listados são os do <b>servidor</b> que executa o backend, não do dispositivo do navegador.</p>

      <MediaDisks key={discoverKey} onChanged={() => { locs.reload(); roots.reload() }} />

      <h2 className="mb-2 font-semibold">Raízes autorizadas</h2>
      {roots.loading ? <Spinner /> : (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {roots.data?.map((r) => (
            <div key={r.index} className="rounded-lg bg-surface p-4">
              <div className="mb-2 flex justify-between text-sm"><span className="font-mono">{r.path}</span>{!r.exists && <span className="text-red-400">não existe</span>}</div>
              <Bar percent={r.usage.total ? (r.usage.used / r.usage.total) * 100 : 0} />
              <div className="mt-1 text-xs text-zinc-400">{fmtBytes(r.usage.used)} usados · {fmtBytes(r.usage.free)} livres de {fmtBytes(r.usage.total)}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 font-semibold">Pastas registradas</h2>
      {locs.error && <Notice text={locs.error} />}
      {locs.data?.length === 0 && <Notice text="Nenhuma pasta registrada. Registre ao menos uma pasta do tipo Geral para poder baixar." />}
      <div className="grid gap-3 md:grid-cols-2">
        {locs.data?.map((l) => (
          <div key={l.id} className="rounded-lg bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{l.name} {l.isDefault && <span className="ml-1 rounded bg-red-700 px-1.5 text-xs">padrão</span>}</div>
                <div className="truncate font-mono text-xs text-zinc-400">{l.path}</div>
              </div>
              <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs">{kindLabel[l.kind]}</span>
            </div>
            <div className="my-3"><Bar percent={l.percentUsed} warn={l.lowSpace} /></div>
            <div className="text-xs text-zinc-400">{fmtBytes(l.usage.free)} livres de {fmtBytes(l.usage.total)}</div>
            {l.offline && <p className="mt-1 text-xs text-red-400">💽 Disco desconectado: o espaço mostrado é da memória do servidor, não do disco. Reconecte o disco ou remova esta pasta da lista.</p>}
            {!l.offline && !l.exists && <p className="mt-1 text-xs text-red-400">A pasta não existe no servidor.</p>}
            {!l.offline && l.exists && !l.writable && <p className="mt-1 text-xs text-red-400">Sem permissão de gravação.</p>}
            {l.lowSpace && <p className="mt-1 text-xs text-amber-400">⚠ Pouco espaço livre — novos downloads podem ser bloqueados.</p>}
            <div className="mt-3 flex gap-2">
              <button className={btnGhost} onClick={() => act(() => api(`/storage/locations/${l.id}/test`, { method: 'POST' }), 'Pasta existe e aceita gravação')}>Testar</button>
              {!l.isDefault && <button className={btnGhost} onClick={() => act(() => api(`/storage/locations/${l.id}/default`, { method: 'POST' }), 'Padrão atualizado')}>Tornar padrão</button>}
              <button className={btnGhost + ' ml-auto !text-red-400'} onClick={() => confirm(`Remover "${l.name}" da lista de locais de download?\n\nOs arquivos no disco NÃO são apagados.`) && act(() => api(`/storage/locations/${l.id}`, { method: 'DELETE' }), 'Local removido da lista')}>🗑 Remover da lista</button>
            </div>
          </div>
        ))}
      </div>
      {addingDisk && <AddDisk onClose={() => setAddingDisk(false)} onDone={() => { setAddingDisk(false); locs.reload(); roots.reload(); setDiscoverKey((k) => k + 1) }} />}
      {adding && roots.data && <AddModal roots={roots.data} onClose={() => setAdding(false)} onDone={() => { setAdding(false); locs.reload(); setDiscoverKey((k) => k + 1) }} />}
    </div>
  )
}
