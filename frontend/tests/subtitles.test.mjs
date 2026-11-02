import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/subtitles.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { parseVtt, subtitleAt, transcodeStart } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
const cues = parseVtt(`WEBVTT

00:01.000 --> 00:04.000
Fala anterior

00:02.000 --> 00:03.000
Fala nova

00:05.000 --> 00:06.000
Próxima fala
`)

test('new dialogue remains visible while an older cue overlaps', () => {
  assert.equal(subtitleAt(cues, 2.5), 'Fala anterior\nFala nova')
  assert.equal(subtitleAt(cues, 3), 'Fala anterior')
})
test('expired subtitles disappear and seeking backwards finds the correct line', () => {
  assert.equal(subtitleAt(cues, 4), '')
  assert.equal(subtitleAt(cues, 5.5), 'Próxima fala')
  assert.equal(subtitleAt(cues, 1.2), 'Fala anterior')
})
test('positive delay postpones text and negative delay advances it', () => {
  assert.equal(subtitleAt(cues, 5.2, 0.5), '')
  assert.equal(subtitleAt(cues, 5.7, 0.5), 'Próxima fala')
  assert.equal(subtitleAt(cues, 4.7, -0.5), 'Próxima fala')
})
test('parser handles CRLF, cue identifiers/settings, unordered cues and invalid intervals', () => {
  const parsed = parseVtt('WEBVTT\r\n\r\nlate\r\n00:00:10.500 --> 00:00:11.000 align:start\r\n<i>Olá</i>\r\n\r\n00:01.000 --> 00:02.000\r\nOi\r\n\r\n00:04.000 --> 00:03.000\r\nInválido\r\n\r\nbad --> time\r\nInválido')
  assert.deepEqual(parsed, [{ start: 1, end: 2, text: 'Oi' }, { start: 10.5, end: 11, text: 'Olá' }])
})
test('resuming transcodes preserves fractional seconds in both request and subtitle clock', () => {
  assert.equal(transcodeStart(123.75), '123.750')
  assert.equal(subtitleAt(cues, Number(transcodeStart(1.75)) + 0.5), 'Fala anterior\nFala nova')
})

test('Black Clover episode 4 at 17:54 shows dialogue alongside the exam sign', () => {
  const episodeCues = parseVtt(`WEBVTT

17:50.820 --> 17:55.250
<b>Exame de controle de Habilidade Mágica</b>

17:53.650 --> 17:55.250
<b>Não se preocupe com isso.
Dê o melhor de si.</b>
`)
  assert.equal(subtitleAt(episodeCues, 17 * 60 + 54), 'Exame de controle de Habilidade Mágica\nNão se preocupe com isso.\nDê o melhor de si.')
  assert.equal(subtitleAt(episodeCues, 17 * 60 + 55.25), '')
})
