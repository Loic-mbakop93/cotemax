import { supabase } from './supabase.js'

// Fetch matches with their best odds for a given date window
export async function fetchMatchesForDate(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const from = new Date(dateStr + 'T00:00:00Z').toISOString()
  const to   = new Date(dateStr + 'T23:59:59Z').toISOString()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .gte('commence_time', from)
    .lte('commence_time', to)
    .order('commence_time', { ascending: true })

  if (error) throw error
  return matches ?? []
}

// Fetch latest odds snapshot for a single match (all bookmakers)
export async function fetchOddsForMatch(matchId) {
  const { data, error } = await supabase
    .from('latest_odds')
    .select('*')
    .eq('match_id', matchId)

  if (error) throw error
  return data ?? []
}

// Fetch best odds across all bookmakers for a list of match IDs
export async function fetchBestOddsForMatches(matchIds) {
  if (!matchIds.length) return {}

  const { data, error } = await supabase
    .from('latest_odds')
    .select('match_id, bookmaker_key, h2h_home, h2h_draw, h2h_away')
    .in('match_id', matchIds)

  if (error) throw error

  // Group by match_id and find best per outcome
  const result = {}
  for (const row of data ?? []) {
    const m = result[row.match_id] ??= { home: null, draw: null, away: null, homeBm: '', drawBm: '', awayBm: '' }
    if (row.h2h_home && (!m.home || row.h2h_home > m.home)) { m.home = row.h2h_home; m.homeBm = row.bookmaker_key }
    if (row.h2h_draw && (!m.draw || row.h2h_draw > m.draw)) { m.draw = row.h2h_draw; m.drawBm = row.bookmaker_key }
    if (row.h2h_away && (!m.away || row.h2h_away > m.away)) { m.away = row.h2h_away; m.awayBm = row.bookmaker_key }
  }
  return result
}

// Fetch all bookmakers (for CTA links)
export async function fetchBookmakers() {
  const { data, error } = await supabase
    .from('bookmakers')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Format odds value: "2.15" or "–" if null
export function fmtOdd(v) {
  if (!v) return '–'
  return Number(v).toFixed(2)
}

// French date formatting helpers
const FR_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const FR_MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']

export function fmtMatchTime(isoStr) {
  const d = new Date(isoStr)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}h${m}`
}

export function fmtMatchDate(isoStr) {
  const d = new Date(isoStr)
  return `${FR_DAYS[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

export function getDateRange(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// Trigger the edge function manually (optional, in case cron isn't set up)
export async function triggerOddsRefresh() {
  const { data, error } = await supabase.functions.invoke('fetch-odds')
  return { data, error }
}
