// Reprodução do vídeo convertido (MP4 fragmentado) por MediaSource.
//
// Com <video src> o navegador decide sozinho quando baixar: ao encher o buffer ele fecha a conexão e, mais tarde, pede
// "o resto" com Range. Uma conversão ao vivo não tem como atender a esse pedido: recomeça do início, o navegador
// descarta tudo o que já tinha recebido e a imagem fica parada enquanto isso. Aqui a página lê o fluxo e só puxa mais
// dados quando o buffer está baixo, então a conexão é uma só, do começo ao fim.

/** O vídeo convertido é sempre H.264 + AAC; perfil e nível reais vêm no próprio arquivo. */
const MIME = 'video/mp4; codecs="avc1.640028, mp4a.40.2"'
/** Segundos mantidos à frente da posição atual antes de parar de ler, e atrás dela antes de descartar. */
const AHEAD = 60, BEHIND = 30

export function mseSupported() {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Liga o fluxo de `url` ao `video`. Devolve a função que desliga tudo.
 * `onUnsupported`: o navegador recusou o formato antes de tocar (o chamador volta para <video src>).
 * Se o fluxo cair no meio, o que já chegou toca até o fim e o vídeo dispara "ended" antes da hora.
 */
export function attachStream(video: HTMLVideoElement, url: string, onUnsupported: () => void) {
  const ms = new MediaSource()
  const objectUrl = URL.createObjectURL(ms)
  const abort = new AbortController()
  let dead = false

  const run = async () => {
    let sb: SourceBuffer
    try {
      sb = ms.addSourceBuffer(MIME)
    } catch {
      if (!dead) onUnsupported()
      return
    }
    const idle = () => (sb.updating ? new Promise<void>((r) => sb.addEventListener('updateend', () => r(), { once: true })) : Promise.resolve())
    const start = () => (sb.buffered.length ? sb.buffered.start(0) : 0)
    const end = () => (sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0)
    const trim = async (keep: number) => {
      const upTo = video.currentTime - keep
      if (upTo - start() < 10) return false
      sb.remove(0, upTo)
      await idle()
      return true
    }
    const append = async (chunk: Uint8Array) => {
      for (let tries = 0; ; tries++) {
        try {
          sb.appendBuffer(chunk as BufferSource)
          await idle()
          return
        } catch (e) {
          // buffer do navegador cheio: libera o que já foi assistido e tenta de novo
          if ((e as DOMException)?.name !== 'QuotaExceededError' || tries > 20) throw e
          if (!(await trim(tries < 3 ? BEHIND : 5))) await sleep(1000)
        }
      }
    }

    let complete = false
    try {
      const res = await fetch(url, { signal: abort.signal })
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status)
      const reader = res.body.getReader()
      for (;;) {
        // sem ler, o servidor fica parado esperando (e o ffmpeg com ele)
        while (!dead && !video.error && end() - video.currentTime > AHEAD) await sleep(500)
        if (dead || video.error) return
        const { done, value } = await reader.read()
        if (done) { complete = true; break }
        if (dead) return
        await append(value)
        await trim(BEHIND)
      }
    } catch {
      if (dead) return
      // conexão caiu ou o navegador recusou os dados: encerra com o que tem
    }
    if (dead || video.error || ms.readyState !== 'open') return
    if (!complete && !sb.buffered.length) { onUnsupported(); return }
    try { await idle(); ms.endOfStream() } catch { /* já encerrado */ }
  }

  ms.addEventListener('sourceopen', () => { void run() }, { once: true })
  video.src = objectUrl

  return () => {
    dead = true
    abort.abort()
    URL.revokeObjectURL(objectUrl)
  }
}
