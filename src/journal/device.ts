export const journalDevices = ['iphone', 'ipad', 'android', 'windows', 'mac', 'unknown'] as const
export type JournalDevice = typeof journalDevices[number]

type BrowserPlatform = { userAgent?: string; platform?: string; maxTouchPoints?: number }

export function detectJournalDevice(browser: BrowserPlatform): JournalDevice {
  const agent = browser.userAgent ?? ''
  const platform = browser.platform ?? ''
  if (/iPad/i.test(agent) || (/Mac/i.test(platform) && (browser.maxTouchPoints ?? 0) > 1)) return 'ipad'
  if (/iPhone|iPod/i.test(agent)) return 'iphone'
  if (/Android/i.test(agent)) return 'android'
  if (/Windows/i.test(agent)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(agent)) return 'mac'
  if (/Win/i.test(platform)) return 'windows'
  if (/Mac/i.test(platform)) return 'mac'
  return 'unknown'
}

export function journalDeviceLabel(device: JournalDevice, language: 'en' | 'ru'): string {
  if (device === 'unknown') return language === 'ru' ? 'Устройство не определено' : 'Unknown device'
  return { iphone: 'iPhone', ipad: 'iPad', android: 'Android', windows: 'Windows', mac: 'Mac' }[device]
}
