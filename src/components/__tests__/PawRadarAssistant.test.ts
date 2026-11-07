import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PawRadarAssistant from '../PawRadarAssistant.vue'
import { i18n } from '../../i18n'
import { setSessionToken, invalidateAuthContext } from '../../services/authSession'
import { AssistantRequestError } from '../../services/assistant'
import { assistantTopics } from '../../../shared/assistantGuidance.js'

const mocks = vi.hoisted(() => ({ ask: vi.fn(), status: vi.fn() }))
vi.mock('../../services/assistant', async original => ({ ...await original<typeof import('../../services/assistant')>(), askAssistant: mocks.ask, assistantStatus: mocks.status }))
const wrappers: VueWrapper[] = []
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function render() {
  const wrapper = mount(PawRadarAssistant, { props: { active: true }, attachTo: document.body })
  wrappers.push(wrapper)
  await wrapper.get('.assistant-launcher').trigger('click'); await flushPromises()
  return wrapper
}
async function submit(wrapper: VueWrapper, text = 'Please give me a calm search checklist.') {
  await wrapper.get('textarea').setValue(text)
  const checkbox = wrapper.find('input[type="checkbox"]')
  if (checkbox.exists() && !(checkbox.element as HTMLInputElement).checked) await checkbox.setValue(true)
  await wrapper.get('form').trigger('submit')
}
beforeEach(() => {
  localStorage.clear(); invalidateAuthContext()
  i18n.global.locale.value = 'en'
  mocks.ask.mockReset().mockResolvedValue({ mode: 'ai', text: 'Synthetic answer' })
  mocks.status.mockReset().mockResolvedValue(true)
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.documentElement.removeAttribute('data-theme'); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each((['en', 'zh-HK', 'zh-CN'] as const).flatMap(locale => ['light', 'dark'].map(theme => ({ locale, theme }))))('$locale/$theme shows compact accepted status, accessible Change and an unchecked withdrawal control', async ({ locale, theme }) => {
  i18n.global.locale.value = locale
  document.documentElement.setAttribute('data-theme', theme)
  const wrapper = await render()
  const checkbox = wrapper.get<HTMLInputElement>('input[type="checkbox"]')
  expect(checkbox.element.checked).toBe(false)
  expect(wrapper.get('.assistant-consent').text()).toBe(i18n.global.t('assistant.consent'))
  checkbox.element.focus()
  await checkbox.setValue(true); await flushPromises()
  expect(wrapper.find('.assistant-consent').exists()).toBe(false)
  const status = wrapper.get('.assistant-consent-status')
  expect(status.text()).toContain(i18n.global.t('assistant.sharingEnabled'))
  const change = status.get('button')
  expect(change.text()).toBe(i18n.global.t('assistant.changeConsent'))
  expect(change.attributes('type')).toBe('button')
  expect(change.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(change.element)
  await change.trigger('click'); await flushPromises()
  const expanded = wrapper.get<HTMLInputElement>('input[type="checkbox"]')
  expect(expanded.element.checked).toBe(true)
  expect(document.activeElement).toBe(expanded.element)
  expect(change.attributes('aria-controls')).toBe(wrapper.get('.assistant-consent').attributes('id'))
  expect(change.attributes('aria-expanded')).toBe('true')
  await expanded.setValue(false); await flushPromises()
  expect(wrapper.find('.assistant-consent-status').exists()).toBe(false)
  expect(wrapper.get<HTMLInputElement>('input').element.checked).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('input').element)
  expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
  expect(mocks.ask).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'] as const)('withdrawal aborts AI and a quick reaccept cannot revive an obsolete %s', async outcome => {
  const old = deferred<{ mode: string; text: string }>(), current = deferred<{ mode: string; text: string }>()
  mocks.ask.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const wrapper = await render(); await submit(wrapper)
  const original = structuredClone(mocks.ask.mock.calls[0][0])
  const signal = mocks.ask.mock.calls[0][1] as AbortSignal
  await wrapper.get('.assistant-consent-status button').trigger('click')
  await wrapper.get('input').setValue(false)
  expect(signal.aborted).toBe(true)
  expect(wrapper.get('.assistant-send').text()).toBe(i18n.global.t('assistant.send'))
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(original.text)
  await wrapper.get('form').trigger('submit')
  expect(mocks.ask).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('assistant.consentRequired'))
  await wrapper.get('input').setValue(true)
  expect(mocks.ask).toHaveBeenCalledTimes(1) // Explicit acceptance never sends.
  await wrapper.get('form').trigger('submit')
  expect(mocks.ask).toHaveBeenCalledTimes(2)
  expect(mocks.ask.mock.calls[1][0]).toEqual(original)
  expect(wrapper.findAll('.from-user')).toHaveLength(1)
  if (outcome === 'resolve') old.resolve({ mode: 'ai', text: 'Obsolete revoked response' })
  else old.reject(new Error('Obsolete revoked failure'))
  await flushPromises()
  expect(wrapper.get('.assistant-send').text()).toBe(i18n.global.t('assistant.stop'))
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Obsolete revoked')
  current.resolve({ mode: 'ai', text: 'Current permitted response' }); await flushPromises()
  expect(wrapper.text()).toContain('Current permitted response')
})

it('reviewed help stays available after withdrawal and consent is absent in a newly mounted session', async () => {
  const wrapper = await render(); await submit(wrapper); await flushPromises()
  await wrapper.get('.assistant-consent-status button').trigger('click')
  await wrapper.get('input').setValue(false)
  await wrapper.get('.assistant-suggestions button').trigger('click')
  expect(wrapper.text()).toContain(assistantTopics('en')[0].answer)
  expect(mocks.ask).toHaveBeenCalledTimes(1)
  expect(wrapper.find('.assistant-consent-status').exists()).toBe(false)
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  await wrapper.get('input').setValue(true)
  wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1)
  const fresh = await render()
  expect(fresh.get<HTMLInputElement>('input').element.checked).toBe(false)
  expect(fresh.find('.assistant-consent-status').exists()).toBe(false)
})

it('account invalidation wins over queued consent focus changes', async () => {
  const wrapper = await render()
  wrapper.get('input').element.focus()
  const accept = wrapper.get('input').setValue(true)
  invalidateAuthContext()
  await accept; await flushPromises()
  expect(wrapper.find('.assistant-consent-status').exists()).toBe(false)
  expect(wrapper.get<HTMLInputElement>('input').element.checked).toBe(false)
})

it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s exposes localized reviewed help with no consent or AI call', async locale => {
  i18n.global.locale.value = locale; mocks.status.mockResolvedValue(false)
  const wrapper = await render()
  expect(wrapper.get('h2').text()).toBe(i18n.global.t('assistant.title'))
  expect(wrapper.get('.assistant-consent').text()).toContain('Cloudflare Workers AI')
  expect(wrapper.text()).not.toContain('Groq')
  expect(wrapper.text()).toContain(i18n.global.t('assistant.disabled'))
  await wrapper.get('.assistant-suggestions button').trigger('click')
  expect(wrapper.text()).toContain(assistantTopics(locale)[0].answer)
  expect(wrapper.text()).toContain(i18n.global.t('assistant.reviewed'))
  expect(mocks.ask).not.toHaveBeenCalled()
  await wrapper.get('.assistant-topic-action').trigger('click')
  expect(wrapper.emitted('navigate')).toEqual([['report']])
  expect(wrapper.find('.assistant-panel').exists()).toBe(false)
})

it('requires explicit external-processing consent before first AI request', async () => {
  const wrapper = await render()
  await wrapper.get('textarea').setValue('Hello, can we talk?')
  await wrapper.get('form').trigger('submit')
  expect(mocks.ask).not.toHaveBeenCalled()
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('assistant.consentRequired'))
  await wrapper.get('input').setValue(true); await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(mocks.ask.mock.calls[0][0]).toEqual({ text: 'Hello, can we talk?', locale: 'en', history: [], consent: true })
  expect(wrapper.text()).toContain(i18n.global.t('assistant.generated'))
})

it('never executes HTML, model routes or user-written text, and does not translate user content', async () => {
  mocks.ask.mockResolvedValue({ mode: 'ai', text: '<img src=x onerror=alert(1)> /moderation' })
  const wrapper = await render()
  await submit(wrapper, 'My pet 小虎 is missing.'); await flushPromises()
  expect(wrapper.findAll('.assistant-message img')).toHaveLength(0)
  expect(wrapper.findAll('.assistant-topic-action')).toHaveLength(0)
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  i18n.global.locale.value = 'zh-HK'; await flushPromises()
  expect(wrapper.text()).toContain('My pet 小虎 is missing.')
  expect(wrapper.emitted('navigate')).toBeUndefined()
})

it('unknown app questions remain accurate reviewed guidance in every locale', async () => {
  const wrapper = await render()
  await wrapper.get('textarea').setValue('Can PawRadar dispatch a helicopter?')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.text()).toContain('cannot verify other app capabilities')
  expect(wrapper.findAll('.assistant-topic-action')).toHaveLength(0)
  i18n.global.locale.value = 'zh-HK'; await flushPromises()
  expect(wrapper.text()).toContain('無法確認其他功能')
  i18n.global.locale.value = 'zh-CN'; await flushPromises()
  expect(wrapper.text()).toContain('无法确认其他功能')
  expect(mocks.ask).not.toHaveBeenCalled()
})

it('new reviewed answers still scroll into view after the transcript reaches its cap', async () => {
  const wrapper = await render()
  for (let i = 0; i < 12; i++) await wrapper.get('.assistant-suggestions button').trigger('click')
  const log = wrapper.get('.assistant-transcript').element as HTMLElement
  Object.defineProperty(log, 'scrollHeight', { value: 2000 })
  log.scrollTop = 0
  await wrapper.get('.assistant-suggestions button').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.assistant-message')).toHaveLength(24)
  expect(log.scrollTop).toBe(2000)
})

it('Enter respects Chinese composition, legacy keyCode and Shift+Enter before sending', async () => {
  const wrapper = await render()
  await wrapper.get('input').setValue(true); await wrapper.get('textarea').setValue('請給我一般尋找建議')
  const input = wrapper.get('textarea')
  await input.trigger('compositionstart'); await input.trigger('keydown', { key: 'Enter' }); expect(mocks.ask).not.toHaveBeenCalled()
  await input.trigger('compositionend')
  await input.trigger('keydown', { key: 'Enter', isComposing: true })
  await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
  await input.trigger('keydown', { key: 'Enter', shiftKey: true })
  expect(mocks.ask).not.toHaveBeenCalled()
  await input.trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(mocks.ask).toHaveBeenCalledTimes(1)
})

it('intentional stop retains draft and one user turn; explicit retry reuses its immutable context', async () => {
  const pending = deferred<{ mode: string; text: string }>()
  mocks.ask.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await submit(wrapper)
  const original = structuredClone(mocks.ask.mock.calls[0][0])
  const signal = mocks.ask.mock.calls[0][1] as AbortSignal
  await wrapper.get('.assistant-send').trigger('click')
  expect(signal.aborted).toBe(true)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(original.text)
  expect(wrapper.findAll('.from-user')).toHaveLength(1)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(mocks.ask.mock.calls[1][0]).toEqual(original)
  expect(wrapper.findAll('.from-user')).toHaveLength(1)
  pending.resolve({ mode: 'ai', text: 'Obsolete success' }); await flushPromises()
  expect(wrapper.text()).not.toContain('Obsolete success')
  expect(wrapper.text()).toContain('Synthetic answer')
})

it('failure preserves input; retry does not duplicate turns or include error/help text in history', async () => {
  mocks.ask.mockRejectedValueOnce(new AssistantRequestError('ASSISTANT_QUOTA'))
  const wrapper = await render(); await submit(wrapper); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('assistant.quota'))
  expect(wrapper.findAll('.from-user')).toHaveLength(1)
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(mocks.ask.mock.calls[1][0]).toEqual(mocks.ask.mock.calls[0][0])
  expect(wrapper.findAll('.from-user')).toHaveLength(1)
  await wrapper.get('.assistant-suggestions button').trigger('click')
  await submit(wrapper, 'Thank you. What else should I think about?'); await flushPromises()
  expect(mocks.ask.mock.calls[2][0].history).toEqual([{ role: 'user', content: 'Please give me a calm search checklist.' }, { role: 'assistant', content: 'Synthetic answer' }])
})

it.each(['resolve', 'reject'] as const)('same-tick account switch rejects obsolete %s and clears draft/consent/retry', async outcome => {
  setSessionToken('synthetic-account-a')
  const pending = deferred<{ mode: string; text: string }>(); mocks.ask.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await submit(wrapper)
  const signal = mocks.ask.mock.calls[0][1] as AbortSignal
  setSessionToken('synthetic-account-b'); await flushPromises()
  expect(signal.aborted).toBe(true)
  expect(wrapper.findAll('.assistant-message')).toHaveLength(0)
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false)
  await submit(wrapper, 'New account question')
  if (outcome === 'resolve') pending.resolve({ mode: 'ai', text: 'Old account private text' })
  else pending.reject(new Error('Old failure'))
  await flushPromises()
  expect(wrapper.text()).not.toContain('Old account private text')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('Synthetic answer')
})

it('cross-tab logout and same-token invalidation clear still-mounted conversations', async () => {
  setSessionToken('synthetic-a')
  const wrapper = await render(); await submit(wrapper); await flushPromises()
  localStorage.removeItem('token')
  window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'synthetic-a', newValue: null, storageArea: localStorage }))
  await flushPromises(); expect(wrapper.findAll('.assistant-message')).toHaveLength(0)
  await submit(wrapper); await flushPromises()
  invalidateAuthContext(); await flushPromises()
  expect(wrapper.findAll('.assistant-message')).toHaveLength(0)
})

it('locale round trips, Clear, close and leaving Radar abort obsolete work', async () => {
  const pending = deferred<{ mode: string; text: string }>(); mocks.ask.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await submit(wrapper)
  const signal = mocks.ask.mock.calls[0][1] as AbortSignal
  i18n.global.locale.value = 'zh-HK'; i18n.global.locale.value = 'en'
  pending.reject(new Error('obsolete locale error')); await flushPromises()
  expect(signal.aborted).toBe(true); expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  await wrapper.get('.assistant-clear').trigger('click'); expect(wrapper.findAll('.assistant-message')).toHaveLength(0)
  expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false)
  const second = deferred<{ mode: string; text: string }>(); mocks.ask.mockReturnValueOnce(second.promise)
  await submit(wrapper); await wrapper.setProps({ active: false })
  expect((mocks.ask.mock.calls[1][1] as AbortSignal).aborted).toBe(true)
  expect(wrapper.find('.assistant-root').exists()).toBe(false)
  await wrapper.setProps({ active: true })
  expect(wrapper.find('.assistant-panel').exists()).toBe(false)
  second.resolve({ mode: 'ai', text: 'hidden result' }); await flushPromises()
  await wrapper.get('.assistant-launcher').trigger('click'); await flushPromises()
  expect(wrapper.text()).not.toContain('hidden result')
  await wrapper.get('.assistant-panel').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.assistant-launcher').element)
})

it('new pending request keeps its loading state when an older stopped request finally settles', async () => {
  const old = deferred<{ mode: string; text: string }>(), newer = deferred<{ mode: string; text: string }>()
  mocks.ask.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
  const wrapper = await render(); await submit(wrapper)
  await wrapper.get('.assistant-send').trigger('click'); await submit(wrapper, 'A different new question')
  old.resolve({ mode: 'ai', text: 'stale' }); await flushPromises()
  expect(wrapper.get('.assistant-send').text()).toBe(i18n.global.t('assistant.stop'))
  newer.resolve({ mode: 'ai', text: 'current' }); await flushPromises()
  expect(wrapper.text()).toContain('current'); expect(wrapper.text()).not.toContain('stale')
})

it('bounds visible memory and outgoing history; oversized programmatic input is rejected', async () => {
  const wrapper = await render()
  await wrapper.get('textarea').setValue('x'.repeat(1001)); await wrapper.get('input').setValue(true)
  await wrapper.get('form').trigger('submit'); expect(mocks.ask).not.toHaveBeenCalled()
  for (let i = 0; i < 14; i++) { await submit(wrapper, `General search question ${i}`); await flushPromises() }
  expect(wrapper.findAll('.assistant-message')).toHaveLength(24)
  expect(mocks.ask.mock.calls.at(-1)![0].history).toHaveLength(6)
  expect(localStorage.length).toBe(0)
})

it('follows measured navigation/visible keyboard viewport and removes listeners on unmount', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const nav = document.createElement('nav')
  nav.getBoundingClientRect = () => ({ height: 96 }) as DOMRect
  const wrapper = await render(); await wrapper.setProps({ navigationElement: nav })
  expect(wrapper.get('.assistant-root').attributes('style')).toContain('--assistant-nav: 96px')
  viewport.height = 360; viewport.offsetTop = 20; viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(wrapper.get('.assistant-root').attributes('style')).toContain('--assistant-height: 360px')
  expect(wrapper.get('.assistant-root').attributes('style')).toContain('--assistant-top: 20px')
  expect(wrapper.get('.assistant-panel').classes()).toContain('assistant-compact')
  const remove = vi.spyOn(viewport, 'removeEventListener')
  wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
})
