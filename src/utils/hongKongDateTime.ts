/** Civil date/time inputs for the Hong Kong reporting workflow, independent of host TZ. */
export const REPORT_TIME_ZONE = 'Asia/Hong_Kong'

const formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
  timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number }
function parts(date: Date): Parts {
  const fields = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]))
  return { year: +fields.year!, month: +fields.month!, day: +fields.day!, hour: +fields.hour!, minute: +fields.minute!, second: +fields.second!, ms: date.getUTCMilliseconds() }
}
function inputValue(value: Parts): string {
  const pad = (number: number, length = 2) => String(number).padStart(length, '0')
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}${value.ms ? `.${pad(value.ms, 3)}` : ''}`
}
function wallMilliseconds(value: Parts): number {
  const date = new Date(0)
  date.setUTCFullYear(value.year, value.month - 1, value.day)
  date.setUTCHours(value.hour, value.minute, value.second, value.ms)
  return date.getTime()
}

export function toHongKongDateTimeInput(value: Date | string): string {
  // Stored strings must identify an instant, never be interpreted in the machine's timezone.
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? inputValue(parts(date)) : ''
}

export function fromHongKongDateTimeInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value)
  if (!match) return null
  const requested: Parts = { year: +match[1]!, month: +match[2]!, day: +match[3]!, hour: +match[4]!, minute: +match[5]!, second: +(match[6] || 0), ms: +(match[7] || '').padEnd(3, '0') }
  const wall = wallMilliseconds(requested)
  let instant = wall
  // Resolve the IANA timezone offset, rather than assuming a computer TZ or slicing UTC.
  for (let attempt = 0; attempt < 3; attempt++) {
    const correction = wall - wallMilliseconds(parts(new Date(instant)))
    if (correction === 0) break
    instant += correction
  }
  const date = new Date(instant)
  return inputValue(parts(date)) === inputValue(requested) ? date.toISOString() : null
}
