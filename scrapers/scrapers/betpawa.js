/**
 * betPawa Cameroon scraper
 * Target: https://www.betpawa.cm/events?sportId=1  (football)
 * Filters for FIFA World Cup matches and extracts 1X2 odds.
 */
import 'dotenv/config'
import { launchBrowser, newStealthPage, parseOdd } from '../lib/browser.js'
import { pushOdds } from '../lib/supabase.js'

const URL     = 'https://www.betpawa.cm/events?sportId=1'
const BM_KEY  = 'betpawa'
// Keywords that identify World Cup matches on betPawa
const WC_KEYWORDS = ['world cup', 'coupe du monde', 'fifa wc', 'wc 2026', 'world cup 2026']

export async function scrapeBetpawa() {
  console.log(`[${BM_KEY}] Starting scrape…`)
  const browser = await launchBrowser()
  const page    = await newStealthPage(browser)
  const results = []

  try {
    await page.goto(URL, { waitUntil: 'networkidle' })

    // Accept cookies if banner present
    const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Accepter")').first()
    if (await cookieBtn.isVisible().catch(() => false)) {
      await cookieBtn.click()
      await page.waitForTimeout(500)
    }

    // betPawa groups matches under competition headers.
    // Strategy: find all competition headers, filter for World Cup,
    // then collect the match rows that follow.
    const competitions = await page.locator('[class*="competition"], [class*="league"], [class*="category"]').all()

    for (const comp of competitions) {
      const compText = (await comp.innerText().catch(() => '')).toLowerCase()
      const isWC = WC_KEYWORDS.some(k => compText.includes(k))
      if (!isWC) continue

      // Sibling match rows
      const matchRows = await comp.locator('xpath=following-sibling::*[contains(@class,"event") or contains(@class,"match")]').all()

      for (const row of matchRows) {
        // Stop if we hit the next competition header
        const rowClass = await row.getAttribute('class').catch(() => '')
        if (rowClass?.includes('competition') || rowClass?.includes('league')) break

        const teams = await row.locator('[class*="team"], [class*="participant"]').allInnerTexts()
        if (teams.length < 2) continue
        const home_team = teams[0].trim()
        const away_team = teams[teams.length - 1].trim()

        // Odds buttons — betPawa shows 3 buttons for 1X2
        const oddBtns = await row.locator('[class*="odd"], [class*="price"], button[data-outcome]').allInnerTexts()

        if (oddBtns.length >= 3) {
          results.push({
            home_team,
            away_team,
            h2h_home: parseOdd(oddBtns[0]),
            h2h_draw: parseOdd(oddBtns[1]),
            h2h_away: parseOdd(oddBtns[2]),
          })
        }
      }
    }

    // Fallback: if competition grouping didn't work, try flat event list
    if (!results.length) {
      console.log(`[${BM_KEY}] Trying flat event strategy…`)
      const events = await page.locator('[class*="event-item"], [class*="match-row"], li[class*="event"]').all()

      for (const ev of events) {
        const text = (await ev.innerText().catch(() => '')).toLowerCase()
        if (!WC_KEYWORDS.some(k => text.includes(k))) continue

        const teams = await ev.locator('[class*="team"]').allInnerTexts()
        const odds  = await ev.locator('[class*="odd"], [class*="price"]').allInnerTexts()

        if (teams.length >= 2 && odds.length >= 3) {
          results.push({
            home_team: teams[0].trim(),
            away_team: teams[teams.length - 1].trim(),
            h2h_home:  parseOdd(odds[0]),
            h2h_draw:  parseOdd(odds[1]),
            h2h_away:  parseOdd(odds[2]),
          })
        }
      }
    }

    console.log(`[${BM_KEY}] Found ${results.length} World Cup match(es).`)
    await pushOdds(BM_KEY, results)
  } catch (err) {
    console.error(`[${BM_KEY}] Error:`, err.message)
  } finally {
    await browser.close()
  }

  return results
}

// Allow running directly: node scrapers/betpawa.js
if (process.argv[1].includes('betpawa')) {
  scrapeBetpawa()
}
