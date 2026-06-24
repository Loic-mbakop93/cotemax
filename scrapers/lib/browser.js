import { chromium } from 'playwright'
import 'dotenv/config'

export async function launchBrowser() {
  return chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  })
}

export async function newStealthPage(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Infinix X689) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    locale: 'fr-CM',
    timezoneId: 'Africa/Douala',
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: {
      'Accept-Language': 'fr-CM,fr;q=0.9',
    },
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(Number(process.env.TIMEOUT_MS) || 30000)
  return page
}

export function parseOdd(text) {
  if (!text) return null
  const n = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''))
  return isNaN(n) || n < 1 ? null : n
}
