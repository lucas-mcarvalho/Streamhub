import { useEffect, useState } from 'react'
import { api, fmtBytes, kindLabel, type Disk, type Location, type Root } from '../api'
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

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); locs.reload() } catch (e) { toast((e as Error).message, 'err') }
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
            {!l.exists && <p className="mt-1 text-xs text-red-400">A pasta não existe no servidor.</p>}
            {l.exists && !l.writable && <p className="mt-1 text-xs text-red-400">Sem permissão de gravação.</p>}
            {l.lowSpace && <p className="mt-1 text-xs text-amber-400">⚠ Pouco espaço livre — novos downloads podem ser bloqueados.</p>}
            <div className="mt-3 flex gap-2">
              <button className={btnGhost} onClick={() => act(() => api(`/storage/locations/${l.id}/test`, { method: 'POST' }), 'Pasta existe e aceita gravação')}>Testar</button>
              {!l.isDefault && <button className={btnGhost} onClick={() => act(() => api(`/storage/locations/${l.id}/default`, { method: 'POST' }), 'Padrão atualizado')}>Tornar padrão</button>}
              <button className={btnGhost} onClick={() => confirm('Remover o registro? Os arquivos não são apagados.') && act(() => api(`/storage/locations/${l.id}`, { method: 'DELETE' }), 'Removido')}>Remover</button>
            </div>
          </div>
        ))}
      </div>
      {addingDisk && <AddDisk onClose={() => setAddingDisk(false)} onDone={() => { setAddingDisk(false); locs.reload(); roots.reload() }} />}
      {adding && roots.data && <AddModal roots={roots.data} onClose={() => setAdding(false)} onDone={() => { setAdding(false); locs.reload() }} />}
    </div>
  )
}
