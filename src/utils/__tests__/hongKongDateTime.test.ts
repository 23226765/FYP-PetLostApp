import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { fromHongKongDateTimeInput, toHongKongDateTimeInput } from '../hongKongDateTime'

it.each([
  ['2026-10-29T20:30:00.000Z', '2026-10-30T04:30:00'],
  ['2026-12-31T16:01:02.345Z', '2027-01-01T00:01:02.345'],
  ['2024-02-29T15:59:59.999Z', '2024-02-29T23:59:59.999'],
])('preserves the same instant through input load/edit/save: %s', (instant, input) => {
  expect(toHongKongDateTimeInput(instant)).toBe(input)
  expect(fromHongKongDateTimeInput(input)).toBe(instant)
})
it('converts minute input explicitly and accepts genuine edits across midnight', () => {
  expect(fromHongKongDateTimeInput('2026-10-30T00:30')).toBe('2026-10-29T16:30:00.000Z')
  expect(fromHongKongDateTimeInput('2026-10-30T00:31:02.3')).toBe('2026-10-29T16:31:02.300Z')
})
it.each(['', 'not a date', '2026-02-30T12:00', '2026-10-29T24:00', '2026-10-29T12:60', '2026-10-29T12:30Z'])('rejects invalid civil input: %s', value => {
  expect(fromHongKongDateTimeInput(value)).toBeNull()
})
it('does not guess a timezone for malformed or timezone-less stored timestamps', () => {
  expect(toHongKongDateTimeInput('2026-10-29T12:30')).toBe('')
  expect(toHongKongDateTimeInput(new Date(NaN))).toBe('')
})
it.each(['America/New_York', 'UTC', 'Asia/Hong_Kong'])('uses Hong Kong time even when the actual child process TZ is %s', timeZone => {
  const moduleUrl = pathToFileURL(resolve('src/utils/hongKongDateTime.ts')).href
  const script = `import {toHongKongDateTimeInput as to,fromHongKongDateTimeInput as from} from ${JSON.stringify(moduleUrl)}; const iso='2026-12-31T16:01:02.345Z'; console.log(JSON.stringify({zone:Intl.DateTimeFormat().resolvedOptions().timeZone, input:to(iso), saved:from(to(iso))}));`
  const result = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timeZone }, encoding: 'utf8', timeout: 10_000,
  }))
  expect(result.zone).toBe(timeZone)
  expect(result.input).toBe('2027-01-01T00:01:02.345')
  expect(result.saved).toBe('2026-12-31T16:01:02.345Z')
})
