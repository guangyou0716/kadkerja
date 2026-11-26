import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceLang, LANG_STORAGE_KEY, saveLang, startLang } from './core'

afterEach(() => localStorage.clear())

describe('which language the app starts in', () => {
  it('follows the device: its first language we have, any Chinese as 简体中文, otherwise English', () => {
    expect(deviceLang(['ms-MY', 'en-GB'])).toBe('ms')
    expect(deviceLang(['fr-FR', 'zh-TW'])).toBe('zh')
    expect(deviceLang(['zh-Hans-CN'])).toBe('zh')
    expect(deviceLang(['zh_CN'])).toBe('zh')
    expect(deviceLang(['EN-us'])).toBe('en')
    expect(deviceLang(['id-ID'])).toBe('ms')
    expect(deviceLang(['ta-MY', 'fr'])).toBe('en')
    expect(deviceLang([])).toBe('en')
    expect(deviceLang(undefined)).toBe('en')
  })

  it('a ?lang= on the link wins, then the saved choice, then the device', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ms')
    expect(startLang('?lang=zh', ['en'])).toBe('zh')
    expect(startLang('', ['zh-CN'])).toBe('ms')
    localStorage.clear()
    expect(startLang('', ['zh-CN'])).toBe('zh')
    expect(startLang('?x=1&lang=ms', ['en'])).toBe('ms')
  })

  it.each(['', 'klingon', 'EN', ' ms', 'zh-CN', '{"lang":"ms"}', 'null', 'undefined', '\u0000'])(
    'ignores a saved value it did not write (%j) and uses the device',
    (junk) => {
      localStorage.setItem(LANG_STORAGE_KEY, junk)
      expect(startLang('', ['ms-MY'])).toBe('ms')
      expect(startLang('', ['fr'])).toBe('en')
    },
  )

  it('ignores a ?lang= it does not know', () => {
    expect(startLang('?lang=fr', ['ms'])).toBe('ms')
    expect(startLang('?lang=ZH', ['en'])).toBe('en')
    expect(startLang('?lang=', ['en'])).toBe('en')
  })

  it('saves the choice, and carries on when the browser will not store anything', () => {
    saveLang('zh')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('zh')
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(startLang('', ['ms'])).toBe('ms')
    expect(() => saveLang('en')).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })
})
