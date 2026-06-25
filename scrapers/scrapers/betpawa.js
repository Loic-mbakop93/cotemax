/**
 * betPawa Cameroon scraper — text-parse approach
 *
 * The page renders match data as structured plain text in this format:
 *   HH:MM Day DD/MM
 *   [Team 1]
 *   [Team 2]
 *   Football / International / FIFA World Cup
 *   1X2 | Fin de Match
 *   1
 *   [home_odd]
 *   X
 *   [draw_odd]
 *   2
 *   [away_odd]
 *
 * We grab document.body.innerText and parse it with regex.
 * betPawa protobuf API is not used (binary encoding, rotating fingerprint headers).
 */
import 'dotenv/config'
import { chromium } from 'playwright'
import { pushOdds } from '../lib/supabase.js'

const PAGE_URL = 'https://www.betpawa.cm/events?sportId=1'
const BM_KEY   = 'betpawa'

const WC_MARKERS = ['fifa world cup', 'coupe du monde fifa', 'world cup 2026', 'world cup']

export async function scrapeBetpawa() {
  console.log(`[${BM_KEY}] Starting scrape…`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 390, height: 844 }, // mobile viewport
  })

  // Hide automation fingerprint
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await ctx.newPage()
  const results = []

  try {
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(3000)

    // Scroll to load lazy content
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(600)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1000)

    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log(`[${BM_KEY}] Page text length: ${bodyText.length}`)

    const parsed = parseBodyText(bodyText)
    results.push(...parsed)

    console.log(`[${BM_KEY}] Found ${results.length} World Cup match(es).`)
    if (results.length) {
      await pushOdds(BM_KEY, results)
    }
  } catch (err) {
    console.error(`[${BM_KEY}] Error:`, err.message)
  } finally {
    await browser.close()
  }

  return results
}

/**
 * Parse the full body.innerText of betPawa to extract World Cup 1X2 odds.
 *
 * The text contains repeated blocks like:
 *   02:00 Thu 25/06\nSouth Africa\nKorea Republic\nFootball / International / FIFA World Cup\n1X2 | Fin de Match\n1\n5.60\nX\n3.75\n2\n1.65
 *
 * Strategy: split on "Football / " section markers, find WC blocks, then
 * look back 3 lines for team names and forward for 1X2 odds.
 */
function parseBodyText(text) {
  const results = []
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()

    // Detect a line that marks this as a World Cup competition block
    const isWC = WC_MARKERS.some(m => line.includes(m))
    if (!isWC) continue

    // The two lines immediately before the "Football / …" marker are the teams
    // Format: ... [time] [team1] [team2] Football / Region / Competition ...
    const team1 = lines[i - 2] ?? ''
    const team2 = lines[i - 1] ?? ''

    if (!team1 || !team2 || team1 === team2) continue
    // Skip if team names look like odds (pure numbers) or UI labels
    if (/^\d+(\.\d+)?$/.test(team1) || /^\d+(\.\d+)?$/.test(team2)) continue
    if (team1.length < 3 || team2.length < 3) continue

    // After the competition line, find "1X2 | Fin de Match" and then 1/X/2 odds
    // Scan the next ~15 lines to find the 1X2 block (skip 1UP/2UP variants)
    let home = null, draw = null, away = null

    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const jl = lines[j].toLowerCase()

      // Skip 1X2 1UP / 1X2 2UP — we only want the base 1X2 market
      if (jl.includes('1x2') && (jl.includes('1up') || jl.includes('2up'))) continue

      // Found base 1X2 market
      if (jl.includes('1x2')) {
        // Expect: "1" → home_odd, "X" → draw_odd, "2" → away_odd
        // Each occupies its own line in the rendered text
        const oddsLines = []
        for (let k = j + 1; k < Math.min(j + 10, lines.length); k++) {
          const kl = lines[k]
          if (oddsLines.length === 3) break
          // Require decimal format (e.g. "5.60") — skips "1"/"2" label lines
          if (/^\d+\.\d+$/.test(kl)) oddsLines.push(parseFloat(kl))
        }
        if (oddsLines.length === 3) {
          home = oddsLines[0]
          draw = oddsLines[1]
          away = oddsLines[2]
        }
        break
      }

      // Stop if we hit the next competition or time marker
      if (jl.startsWith('football /') || /^\d{2}:\d{2}/.test(lines[j])) break
    }

    if (home && away) {
      results.push({
        home_team: team1,
        away_team: team2,
        h2h_home: home,
        h2h_draw: draw,
        h2h_away: away,
      })
    }
  }

  return results
}

// Allow running directly: node scrapers/betpawa.js
if (process.argv[1]?.includes('betpawa')) {
  scrapeBetpawa()
}
