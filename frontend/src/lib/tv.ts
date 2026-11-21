/**
 * Modo TV: ativo dentro do app StreamHub para Android TV (o WebView dele se identifica com "StreamHubTV" no
 * User-Agent). Para testar no navegador do PC, abra com ?tv=1 (e ?tv=0 para desligar).
 *
 * Aqui ficam a navegação pelo controle remoto (setas, OK, voltar) e a ponte com o app nativo.
 */

const FLAG = 'streamhub.tv'

export const isTV: boolean = (() => {
  try {
    const q = new URLSearchParams(location.search).get('tv')
    if (q === '1') localStorage.setItem(FLAG, '1')
    if (q === '0') localStorage.removeItem(FLAG)
    return /StreamHubTV/i.test(navigator.userAgent) || localStorage.getItem(FLAG) === '1'
  } catch { return /StreamHubTV/i.test(navigator.userAgent) }
})()

/** Funções expostas pelo app Android (addJavascriptInterface). Ausentes no navegador comum. */
type Bridge = { keepScreenOn?: (on: boolean) => void; changeServer?: () => void; serverAddress?: () => string }
export const tvBridge = (): Bridge | undefined => (window as unknown as { StreamHubTV?: Bridge }).StreamHubTV

export function keepScreenOn(on: boolean) {
  try { tvBridge()?.keepScreenOn?.(on) } catch { /* app antigo sem a função */ }
}

// ---------------------------------------------------------------------------------------------------------------
// Tecla "voltar" do controle: o app chama window.streamhubBack(); quem estiver aberto (modal, menu do player…) trata
// o evento "streamhub:back" e chama preventDefault. Se ninguém tratar, volta uma tela.

export const BACK_EVENT = 'streamhub:back'

/** Registra um tratador da tecla voltar; devolva true quando ele fechou alguma coisa. */
export function onBack(handler: () => boolean) {
  const h = (e: Event) => { if (!e.defaultPrevented && handler()) e.preventDefault() }
  window.addEventListener(BACK_EVENT, h)
  return () => window.removeEventListener(BACK_EVENT, h)
}

export function dispatchBack(): boolean {
  const ev = new Event(BACK_EVENT, { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

// ---------------------------------------------------------------------------------------------------------------
// Navegação espacial: as setas levam o foco para o elemento mais próximo naquela direção.

/** Quem estiver com o controle (o player) recebe as teclas antes; devolva true para consumir a tecla. */
let interceptor: ((e: KeyboardEvent) => boolean) | null = null
export function setKeyInterceptor(fn: ((e: KeyboardEvent) => boolean) | null) { interceptor = fn }

const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]'

/** Área ativa: o último [data-tv-scope] aberto (modal, menu do player, player em tela cheia) ou a página toda. */
function scope(): ParentNode {
  const all = document.querySelectorAll<HTMLElement>('[data-tv-scope]')
  for (let i = all.length - 1; i >= 0; i--) if (visible(all[i])) return all[i]
  return document
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const s = getComputedStyle(el)
  return s.visibility !== 'hidden' && s.pointerEvents !== 'none' && s.display !== 'none'
}

export function candidates(root: ParentNode = scope()): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
    el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[inert],[aria-hidden="true"]') && visible(el))
}

type Dir = 'up' | 'down' | 'left' | 'right'
const DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

let lastRect: DOMRect | null = null

function best(from: DOMRect, dir: Dir, list: HTMLElement[], current?: HTMLElement | null): HTMLElement | undefined {
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2
  type C = { el: HTMLElement; primary: number; secondary: number; overlap: boolean }
  const cs: C[] = []
  for (const el of list) {
    if (el === current || (current && (el.contains(current) || current.contains(el)))) continue
    const r = el.getBoundingClientRect()
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2
    let primary: number, secondary: number, overlap: boolean
    if (dir === 'right' || dir === 'left') {
      if (dir === 'right' ? ex <= cx + 1 || r.right <= from.right - 1 : ex >= cx - 1 || r.left >= from.left + 1) continue
      primary = dir === 'right' ? Math.max(0, r.left - from.right) : Math.max(0, from.left - r.right)
      overlap = r.top < from.bottom - 4 && r.bottom > from.top + 4
      secondary = overlap ? Math.abs(ey - cy) / 4 : Math.min(Math.abs(r.top - from.bottom), Math.abs(from.top - r.bottom), Math.abs(ey - cy))
    } else {
      if (dir === 'down' ? ey <= cy + 1 || r.bottom <= from.bottom - 1 : ey >= cy - 1 || r.top >= from.top + 1) continue
      primary = dir === 'down' ? Math.max(0, r.top - from.bottom) : Math.max(0, from.top - r.bottom)
      overlap = r.left < from.right - 4 && r.right > from.left + 4
      secondary = Math.abs(ex - cx)
    }
    cs.push({ el, primary, secondary, overlap })
  }
  if (!cs.length) return undefined
  if (dir === 'left' || dir === 'right') {
    // mesma linha primeiro (cartões de uma fileira); depois o mais perto em linha reta
    const row = cs.filter((c) => c.overlap)
    const pool = row.length ? row : cs
    return pool.sort((a, b) => (a.primary + a.secondary * 2) - (b.primary + b.secondary * 2))[0].el
  }
  // para cima/baixo: a linha mais próxima e, nela, o elemento mais alinhado na horizontal
  const near = Math.min(...cs.map((c) => c.primary))
  const band = cs.filter((c) => c.primary <= near + 48)
  return band.sort((a, b) => a.secondary - b.secondary)[0].el
}

export function focusEl(el: HTMLElement, center = true) {
  el.focus({ preventScroll: true })
  lastRect = el.getBoundingClientRect()
  // fileiras horizontais rolam até o cartão; a página centraliza a linha (o topo fica no topo)
  const inFixed = !!el.closest('header, [data-tv-scope]')
  if (!inFixed) el.scrollIntoView({ block: center ? 'center' : 'nearest', inline: 'nearest', behavior: 'smooth' })
  else el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes((el as HTMLInputElement).type)
}

function onKey(e: KeyboardEvent) {
  if (interceptor && interceptor(e)) { e.preventDefault(); e.stopImmediatePropagation(); return }
  const dir = DIRS[e.key]
  if (!dir) return
  const active = document.activeElement as HTMLElement | null
  // dentro de um campo de texto as setas laterais movem o cursor, até chegar à ponta
  if (isTextField(active) && (dir === 'left' || dir === 'right')) {
    try {
      const at = dir === 'left' ? active.selectionStart : active.selectionEnd
      if (dir === 'left' ? at !== 0 : at !== active.value.length) return
    } catch { /* campos sem seleção (email, number) */ }
  }
  // barras deslizantes (volume) usam as setas laterais
  if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range' && (dir === 'left' || dir === 'right')) return
  const list = candidates()
  const has = active && active !== document.body && list.includes(active)
  let next: HTMLElement | undefined
  if (has) next = best(active.getBoundingClientRect(), dir, list, active)
  else {
    // sem foco (a tela acabou de trocar ou o elemento saiu da tela): começa perto de onde estava, ou no primeiro item
    const visibleNow = list.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight })
    const from = lastRect
    next = from ? visibleNow.concat(list).sort((a, b) => dist(a, from) - dist(b, from))[0] : visibleNow[0] ?? list[0]
  }
  e.preventDefault()
  if (next) focusEl(next)
}

function dist(el: HTMLElement, r: DOMRect) {
  const a = el.getBoundingClientRect()
  return Math.hypot(a.left + a.width / 2 - (r.left + r.width / 2), a.top + a.height / 2 - (r.top + r.height / 2))
}

/** Foca o primeiro item útil da tela: o [data-tv-autofocus] ou o primeiro elemento da área principal. */
export function autofocus(root: ParentNode = document): boolean {
  const a = document.activeElement
  if (a && a !== document.body && a.isConnected && visible(a as HTMLElement)) return true
  const s = scope()
  const pick = (s === document ? root : s).querySelector<HTMLElement>('[data-tv-autofocus]')
  if (pick && visible(pick)) { focusEl(pick); return true }
  const main = s === document ? (document.querySelector('main') ?? document) : s
  const first = candidates(main)[0]
  if (first) { focusEl(first, false); return true }
  return false
}

export function installTV() {
  if (!isTV) return
  document.documentElement.classList.add('tv')
  window.addEventListener('keydown', onKey, true)
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement
    if (t?.getBoundingClientRect) lastRect = t.getBoundingClientRect()
  })
}
