import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Download } from 'lucide-react'

const FLY = 'streamhub:download-fly'
export const LANDED = 'streamhub:download-landed'

type Flight = { id: number; x: number; y: number; dx: number; dy: number; poster?: string }

/** Dispara a animação de um download "voando" do botão clicado até o ícone de downloads do cabeçalho. */
export function flyToDownloads(from: Element | DOMRect | null | undefined, poster?: string) {
  const r = from instanceof Element ? from.getBoundingClientRect() : from
  window.dispatchEvent(new CustomEvent(FLY, { detail: { x: r ? r.left + r.width / 2 : window.innerWidth / 2, y: r ? r.top + r.height / 2 : window.innerHeight / 2, poster } }))
}

/** Camada fixa sobre a página onde as animações acontecem; o destino é o elemento com data-download-target. */
export function DownloadFlyLayer() {
  const [flights, setFlights] = useState<Flight[]>([])
  const reduce = useReducedMotion()
  useEffect(() => {
    const h = (e: Event) => {
      const { x, y, poster } = (e as CustomEvent<{ x: number; y: number; poster?: string }>).detail
      const target = Array.from(document.querySelectorAll('[data-download-target]')).find((el) => (el as HTMLElement).offsetParent !== null)
      const t = target?.getBoundingClientRect()
      if (!t || reduce) { window.dispatchEvent(new Event(LANDED)); return }
      setFlights((f) => [...f, { id: Date.now() + Math.random(), x, y, dx: t.left + t.width / 2 - x, dy: t.top + t.height / 2 - y, poster }])
    }
    window.addEventListener(FLY, h)
    return () => window.removeEventListener(FLY, h)
  }, [reduce])
  const done = (id: number) => {
    setFlights((f) => f.filter((x) => x.id !== id))
    window.dispatchEvent(new Event(LANDED))
  }
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden="true">
      <AnimatePresence>
        {flights.map((f) => {
          // arco: sobe acima do ponto mais alto do trajeto antes de descer no ícone
          const lift = Math.min(f.dy, 0) - 90
          return (
            <motion.div key={f.id} className="absolute" style={{ left: f.x, top: f.y }}
              initial={{ x: 0, y: 0 }}
              animate={{ x: [0, f.dx * 0.45, f.dx], y: [0, lift, f.dy] }}
              transition={{ duration: 0.85, ease: [0.45, 0, 0.25, 1], times: [0, 0.45, 1] }}
              onAnimationComplete={() => done(f.id)}>
              <div className="-translate-x-1/2 -translate-y-1/2">
                <motion.div className="relative"
                  initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
                  animate={{ scale: [0.6, 1.15, 0.28], rotate: [-8, 6, 0], opacity: [0, 1, 0.9] }}
                  transition={{ duration: 0.85, times: [0, 0.3, 1], ease: 'easeInOut' }}>
                  {f.poster
                    ? <img src={f.poster} alt="" className="h-24 w-16 rounded-md object-cover shadow-2xl shadow-accent-600/60 ring-2 ring-white/80" />
                    : <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-600 text-white shadow-2xl shadow-accent-600/60 ring-2 ring-white/70"><Download size={26} /></span>}
                  {f.poster && <span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full bg-accent-600 text-white ring-2 ring-white"><Download size={16} /></span>}
                </motion.div>
              </div>
              {/* rastro de brilho */}
              {[0, 1, 2].map((n) => (
                <motion.span key={n} className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-accent-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [1, 0.4], x: [0, -f.dx * 0.08 * (n + 1)], y: [0, -(f.dy - lift) * 0.06 * (n + 1)] }}
                  transition={{ duration: 0.6, delay: 0.12 + n * 0.08 }} />
              ))}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
