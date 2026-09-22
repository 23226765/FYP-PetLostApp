import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import appSource from '../../App.vue?raw'
import settingsSource from '../../views/SettingsScreen.vue?raw'
import appIconSource from '../AppIcon.vue?raw'
import radarSource from '../RadarScreen.vue?raw'
import straySource from '../StrayRescueScreen.vue?raw'

const globalCss = readFileSync(`${process.cwd()}/src/style.css`, 'utf8')

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
})

describe('shared navigation and option state styling', () => {
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
