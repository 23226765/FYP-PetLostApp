import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { compileStyle, parse } from '@vue/compiler-sfc'
import appSource from '../../App.vue?raw'
import settingsSource from '../../views/SettingsScreen.vue?raw'
import appIconSource from '../AppIcon.vue?raw'
import radarSource from '../RadarScreen.vue?raw'
import straySource from '../StrayRescueScreen.vue?raw'
import petCardSource from '../PetCard.vue?raw'
import petDetailSource from '../PetDetail.vue?raw'
import strayDetailSource from '../../views/StrayDetailScreen.vue?raw'

const globalCss = readFileSync(`${process.cwd()}/src/style.css`, 'utf8')

const pressRule = globalCss.match(/^(:where\(button,[^\n]+):active\s*\{([^}]+)\}/m)

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as Rgb
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function themeBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = globalCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  expect(match, `Missing CSS block ${selector}`).toBeTruthy()
  return match?.[1] ?? ''
}

function hexToken(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  expect(match, `Missing hexadecimal token --${name}`).toBeTruthy()
  return match?.[1] ?? '#000000'
}

function tintedSurface(block: string, name: string, surface: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`))
  expect(match).toBeTruthy()
  const opacity = Number(match?.[4])
  return '#' + rgb(surface).map((channel, index) => Math.round(Number(match?.[index + 1]) * opacity + channel * (1 - opacity)).toString(16).padStart(2, '0')).join('')
}

describe('semantic theme contrast', () => {
  const light = themeBlock(':root')
  const dark = themeBlock(":root[data-theme='dark']")

  it('keeps normal text at WCAG AA contrast in both themes', () => {
    const textTokens = ['color-text-primary', 'color-text-secondary', 'color-text-muted']
    for (const token of textTokens) {
      expect(contrast(hexToken(light, token), hexToken(light, 'color-surface'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hexToken(dark, token), hexToken(dark, 'color-surface'))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps navigation and control icons above the 3:1 UI threshold', () => {
    expect(contrast(hexToken(light, 'color-nav-inactive'), hexToken(light, 'color-surface-subtle'))).toBeGreaterThanOrEqual(3)
    expect(contrast(hexToken(light, 'color-nav-active'), hexToken(light, 'color-surface-selected'))).toBeGreaterThanOrEqual(3)
    expect(contrast(hexToken(dark, 'color-nav-inactive'), hexToken(dark, 'color-surface-subtle'))).toBeGreaterThanOrEqual(3)
    expect(contrast(hexToken(dark, 'color-nav-active'), hexToken(dark, 'color-surface-selected'))).toBeGreaterThanOrEqual(3)
    expect(contrast(hexToken(dark, 'color-icon-primary'), hexToken(dark, 'color-surface'))).toBeGreaterThanOrEqual(3)
  })

  it('uses a readable foreground on the coral brand surface', () => {
    expect(contrast(hexToken(light, 'color-text-on-coral'), '#ef6351')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hexToken(dark, 'color-text-on-coral'), '#ef6351')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps disabled labels readable without reducing parent opacity', () => {
    expect(contrast(hexToken(light, 'color-disabled-text'), hexToken(light, 'color-disabled-surface'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hexToken(dark, 'color-disabled-text'), hexToken(dark, 'color-disabled-surface'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps primary buttons, focus indicators and radio boundaries readable on the warm light surfaces', () => {
    expect(contrast(hexToken(light, 'button-primary-text'), hexToken(light, 'button-primary'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hexToken(light, 'color-text-on-accent'), hexToken(light, 'coral'))).toBeGreaterThanOrEqual(3)
    for (const surface of ['page-bg', 'color-surface', 'color-surface-subtle']) {
      expect(contrast(hexToken(light, 'color-focus'), hexToken(light, surface))).toBeGreaterThanOrEqual(3)
      expect(contrast(hexToken(light, 'radio-border'), hexToken(light, surface))).toBeGreaterThanOrEqual(3)
    }
    // Requested separators are decorative, not a substitute for the focus/radio boundary.
    expect(hexToken(light, 'color-border')).toBe('#e6e3de')
    expect(globalCss).toContain('--divider: var(--color-border)')
    expect(globalCss).toContain('--input-bg: var(--color-surface)')
  })
})

describe('shared navigation and option state styling', () => {
  it('shares background-only press feedback across text, icon, navigation and contact buttons', () => {
    expect(pressRule).not.toBeNull()
    const selector = pressRule![1]!
    const styles = pressRule![2]!
    const fixture = document.createElement('div')
    fixture.innerHTML = `<button class="primary">Send</button><button class="icon-button" aria-label="Close"><svg /></button><button class="nav-item active" aria-current="page">Radar</button><a class="contact-action" href="tel:000">Call</a><a class="contact-btn" href="https://example.test/">Contact</a><div class="leaflet-control-zoom"><a href="#">+</a><a class="leaflet-disabled" href="#">−</a></div><details><summary>Options</summary></details><button disabled>Disabled</button><button aria-busy="true">Sending</button><a class="contact-btn" href="#" aria-disabled="true">Disabled link</a><fieldset disabled><button>Disabled preference</button></fieldset><div aria-busy="true"><button class="stop">Stop</button></div><a class="ordinary-link" href="#">Attribution</a>`
    for (const control of fixture.querySelectorAll('.primary, .icon-button, .nav-item, .contact-action, .contact-btn:not([aria-disabled]), .leaflet-control-zoom a:not(.leaflet-disabled), summary, .stop')) expect(control.matches(selector)).toBe(true)
    for (const control of fixture.querySelectorAll('[disabled], [aria-disabled], [aria-busy], .leaflet-disabled, fieldset button, .ordinary-link')) expect(control.matches(selector)).toBe(false)
    expect(styles).toContain('background-image: linear-gradient(var(--control-press-tint), var(--control-press-tint)) !important')
    expect(styles).not.toMatch(/(?:^|[;\n])\s*(?:opacity|filter|color|outline|border|transform|box-shadow)\s*:/)
    expect(globalCss).toContain('button:has(img):not(:disabled, [disabled], [aria-disabled=\'true\'], [aria-busy=\'true\']):active:not(:focus-visible)')
  })

  it('keeps representative pressed text, icon and bottom navigation colours readable in both themes', () => {
    const alpha = 0.08
    expect(globalCss).toContain('--control-press-tint: color-mix(in srgb, currentColor 8%, transparent)')
    for (const theme of [themeBlock(':root'), themeBlock(":root[data-theme='dark']")]) {
      const base = themeBlock(':root')
      for (const [foreground, background, minimum] of [
        [hexToken(base, 'button-primary-text'), hexToken(base, 'button-primary'), 4.5],
        [hexToken(theme, 'color-icon-primary'), hexToken(theme, 'color-surface'), 3],
        [hexToken(theme, 'color-nav-inactive'), hexToken(theme, 'color-surface'), 4.5],
        [hexToken(theme, 'color-nav-active'), hexToken(theme, 'color-surface'), 4.5],
      ] as const) {
        const backgroundRgb = rgb(background)
        const pressed = '#' + rgb(foreground).map((channel, index) => Math.round(channel * alpha + backgroundRgb[index]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')
        expect(contrast(foreground, pressed)).toBeGreaterThanOrEqual(minimum)
      }
    }
  })

  it('compiles dark-only detail cards without leaking their layout onto html or light mode', () => {
    const { descriptor } = parse(petDetailSource)
    const result = compileStyle({ source: descriptor.styles[0]!.content, filename: 'PetDetail.vue', id: 'data-v-card-check', scoped: true })
    expect(result.errors).toEqual([])
    const darkStyles = result.code.split('/* Dark-only card grouping;')[1]!.split('.reunited-cta')[0]!
    expect(darkStyles).toContain("html[data-theme='dark'] .facts[data-v-card-check]")
    expect(darkStyles).toContain("html[data-theme='dark'] .owner[data-v-card-check]")
    expect(darkStyles).not.toMatch(/html\[data-theme='dark'\]\s*\{/)
    expect(darkStyles).toContain('border: 1px solid var(--color-border)')
    expect(darkStyles).toContain('border-radius: var(--radius-lg)')
    expect(darkStyles).toContain('background-color: var(--color-surface-elevated) !important')
    expect(darkStyles).toContain('grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr)')
    expect(darkStyles).toContain('white-space: normal')
    expect(darkStyles).toContain('overflow-wrap: anywhere')
    expect(darkStyles).not.toContain('.distance')
  })
  it('uses semantic active/inactive tokens in the mounted bottom navigation source', () => {
    expect(appSource).toContain('var(--color-nav-active)')
    expect(appSource).toContain('var(--color-nav-inactive)')
    expect(appSource).toContain('var(--color-surface-selected)')
    expect(appSource).not.toContain('--nav-muted: #626b68')
  })

  it('shares one List/Map option-card treatment between Radar and Stray', () => {
    for (const source of [radarSource, straySource]) {
      expect(source).toContain('theme-segmented-control')
      expect(source).toContain('theme-segmented-option')
      expect(source).toContain(':aria-selected=')
    }
  })

  it('keeps SVG icons inheriting the state foreground', () => {
    expect(appIconSource).toContain('stroke="currentColor"')
    expect(appIconSource).not.toMatch(/(?:stroke|fill)="#[0-9a-fA-F]{3,8}"/)
  })

  it('puts radio focus on the complete option card and uses semantic states', () => {
    expect(settingsSource).toContain(".option-card:has(input[type='radio']:focus-visible)")
    expect(settingsSource).toContain('background: var(--option-surface)')
    expect(settingsSource).toContain('background: var(--option-selected-surface)')
    expect(settingsSource).toContain('background: var(--color-disabled-surface)')
  })
})

describe('consistent neutral visual system', () => {
  const light = themeBlock(':root'), dark = themeBlock(":root[data-theme='dark']")
  it('shares the neutral palette across screens and maintains readable text and accent contrast in both themes', () => {
    for (const [feed, base] of [[light, themeBlock(':root')], [dark, themeBlock(":root[data-theme='dark']")]]) {
      for (const foreground of ['color-text-primary', 'color-text-secondary', 'color-text-muted']) {
        for (const background of ['page-bg', 'color-surface', 'color-surface-subtle', 'color-surface-selected']) expect(contrast(hexToken(feed, foreground), hexToken(feed, background))).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(hexToken(base, 'color-text-accent'), hexToken(feed, 'color-surface-selected'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hexToken(base, 'color-text-accent'), tintedSurface(base, 'status-teal-bg', hexToken(feed, 'color-surface')))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hexToken(base, 'color-text-urgent'), tintedSurface(base, 'status-coral-bg', hexToken(feed, 'color-surface')))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hexToken(base, 'color-border-accent'), hexToken(feed, 'page-bg'))).toBeGreaterThanOrEqual(3)
    }
    expect(hexToken(light, 'page-bg')).toBe('#faf9f6')
    expect(hexToken(light, 'color-surface')).toBe('#fffefc')
    expect(hexToken(light, 'color-surface-elevated')).toBe('#fffefc')
    expect(hexToken(light, 'color-surface-subtle')).toBe('#f2f0ec')
    expect(hexToken(dark, 'color-surface')).toBe('#0a0a0a')
    expect(themeBlock('.feed-theme')).not.toContain('--page-bg:')
    expect(globalCss).toMatch(/body\s*\{\s*font-family: var\(--font-feed\)/)
    expect(globalCss).toContain('--option-surface: var(--color-surface)')
    expect(globalCss).toContain('--option-text: var(--color-text-primary)')
    expect(globalCss).toContain("--font-feed: system-ui")
    expect(globalCss).toContain("'Microsoft JhengHei'")
    expect(globalCss).toContain("'Microsoft YaHei'")
    expect(radarSource).toContain('class="radar feed-theme"')
    expect(straySource).toContain('class="rescue-screen feed-theme"')
    expect(radarSource).toContain(':feed="true"')
    expect(petCardSource).toContain('{ feed: false }')
    expect(petCardSource).toContain('.card.feed-card {')
    expect(globalCss).toContain('.feed-theme .theme-segmented-control button.theme-segmented-option')
  })
  it('uses matching 4:3 feed photo and fallback frames while preserving uncropped detail photos', () => {
    expect(petCardSource).toContain('.feed-card .feed-photo { aspect-ratio: 4 / 3; }')
    expect(straySource).toMatch(/\.photo-wrap\s*\{[^}]*position: relative;[^}]*aspect-ratio: 4 \/ 3;[^}]*overflow: hidden/)
    for (const [source, selector] of [[petCardSource, '\\.feed-card \\.feed-photo'], [straySource, '\\.photo-wrap']]) {
      expect(source).toMatch(new RegExp(selector + ' img\\s*\\{[^}]*position: absolute;[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: cover'))
      expect(source).toMatch(/\.photo-placeholder\s*\{[^}]*position: absolute;[^}]*inset: 0;/)
    }
    expect(petDetailSource).toMatch(/\.hero img\s*\{[^}]*height: auto;[^}]*object-fit: contain/)
    expect(petDetailSource).toMatch(/\.sheet\s*\{[^}]*margin-top: 0;/)
    expect(strayDetailSource).toMatch(/\.post-card \.hero\s*\{[^}]*aspect-ratio: auto/)
    expect(strayDetailSource).toMatch(/\.post-card \.hero img\s*\{[^}]*height: auto;[^}]*object-fit: contain/)
    for (const source of [petCardSource, straySource]) expect(source).not.toMatch(/\.photo-placeholder\s*\{[^}]*min-height: 128px/)
    expect(petCardSource).toContain('.feed-card:focus-visible')
    expect(straySource).toContain('.stray-card:focus-visible')
  })
  it('keeps edge-to-edge posts and navigation flat, with static loading placeholders', () => {
    const block = (source: string, selector: string) => source.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}'))?.[1] || ''
    for (const [source, selector] of [[petCardSource, '.card.feed-card'], [straySource, '.stray-card']]) {
      expect(block(source, selector)).toContain('border-radius: 0')
      expect(block(source, selector)).toContain('box-shadow: none')
      expect(block(source, selector)).toContain('border-bottom: 1px solid')
    }
    expect(globalCss).not.toContain('--feed-image-ratio:')
    expect(block(radarSource, '.radar')).toMatch(/padding:[^;]*\) 0 calc/)
    expect(block(straySource, '.rescue-screen')).toMatch(/padding:[^;]*\) 0 calc/)
    expect(block(appSource, '.tabbar')).toContain('border-radius: 0')
    expect(block(appSource, '.tabbar')).toContain('box-shadow: none')
    expect(block(appSource, '.report-icon')).toContain('width: 38px')
    expect(block(appSource, '.report-icon')).toContain('height: 38px')
    expect(block(appSource, '.report-icon')).toContain('background: var(--nav-accent)')
    expect(block(appSource, '.report-icon')).toContain('color: var(--color-text-on-accent)')
    expect(block(appSource, '.tabbar button')).toContain('grid-template-rows: 38px auto')
    expect(block(appSource, '.tabbar .report-item')).not.toContain('margin-top: -')
    expect(block(globalCss, '.feed-skeleton-photo')).not.toContain('animation')
    expect(appSource).toContain('class="tabbar feed-theme"')
    const focus = block(appSource, '.tabbar button:focus-visible')
    expect(focus).toContain('outline: 2px solid var(--color-border-accent)')
    expect(focus).toContain('border-radius: 8px')
    expect(appSource).toContain(".tabbar button[aria-current='page']::after")
    expect(appSource).not.toMatch(/\.tabbar button:focus\s*\{/)
  })
})
