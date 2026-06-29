import { supabase } from './supabase.js'

// Fetch matches with their best odds for a given date window
export async function fetchMatchesForDate(dateStr) {
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
const FR_DAYS   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
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

// ── Country flag emojis ──────────────────────────────────────────

function isoToEmoji(iso) {
  return [...iso.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('')
}

// Team name (as returned by The Odds API) → ISO 3166-1 alpha-2 code
const TEAM_ISO = {
  'Afghanistan':              'AF',
  'Albania':                  'AL',
  'Algeria':                  'DZ',
  'Andorra':                  'AD',
  'Angola':                   'AO',
  'Argentina':                'AR',
  'Armenia':                  'AM',
  'Australia':                'AU',
  'Austria':                  'AT',
  'Azerbaijan':               'AZ',
  'Bahrain':                  'BH',
  'Bangladesh':               'BD',
  'Belarus':                  'BY',
  'Belgium':                  'BE',
  'Bolivia':                  'BO',
  'Bosnia and Herzegovina':   'BA',
  'Botswana':                 'BW',
  'Brazil':                   'BR',
  'Bulgaria':                 'BG',
  'Burkina Faso':             'BF',
  'Cameroon':                 'CM',
  'Canada':                   'CA',
  'Cape Verde':               'CV',
  'Chile':                    'CL',
  'China PR':                 'CN',
  'Colombia':                 'CO',
  'Congo DR':                 'CD',
  'DR Congo':                 'CD',
  'Costa Rica':               'CR',
  'Croatia':                  'HR',
  'Cuba':                     'CU',
  'Curaçao':                  'CW',
  'Curacao':                  'CW',
  'Cyprus':                   'CY',
  'Czechia':                  'CZ',
  'Czech Republic':           'CZ',
  'Denmark':                  'DK',
  'Ecuador':                  'EC',
  'Egypt':                    'EG',
  'El Salvador':              'SV',
  'England':                  'GB-ENG',
  'Estonia':                  'EE',
  'Ethiopia':                 'ET',
  'Finland':                  'FI',
  'France':                   'FR',
  'Gabon':                    'GA',
  'Georgia':                  'GE',
  'Germany':                  'DE',
  'Ghana':                    'GH',
  'Greece':                   'GR',
  'Guatemala':                'GT',
  'Guinea':                   'GN',
  'Haiti':                    'HT',
  'Honduras':                 'HN',
  'Hungary':                  'HU',
  'Iceland':                  'IS',
  'India':                    'IN',
  'Indonesia':                'ID',
  'IR Iran':                  'IR',
  'Iran':                     'IR',
  'Iraq':                     'IQ',
  'Ireland':                  'IE',
  'Israel':                   'IL',
  'Italy':                    'IT',
  'Ivory Coast':              'CI',
  'Jamaica':                  'JM',
  'Japan':                    'JP',
  'Jordan':                   'JO',
  'Kazakhstan':               'KZ',
  'Kenya':                    'KE',
  'Korea DPR':                'KP',
  'Korea Republic':           'KR',
  'Kosovo':                   'XK',
  'Kuwait':                   'KW',
  'Latvia':                   'LV',
  'Lebanon':                  'LB',
  'Libya':                    'LY',
  'Lithuania':                'LT',
  'Luxembourg':               'LU',
  'Malaysia':                 'MY',
  'Mali':                     'ML',
  'Malta':                    'MT',
  'Mexico':                   'MX',
  'Moldova':                  'MD',
  'Montenegro':               'ME',
  'Morocco':                  'MA',
  'Mozambique':               'MZ',
  'Netherlands':              'NL',
  'New Zealand':              'NZ',
  'Nicaragua':                'NI',
  'Nigeria':                  'NG',
  'North Macedonia':          'MK',
  'Norway':                   'NO',
  'Oman':                     'OM',
  'Panama':                   'PA',
  'Paraguay':                 'PY',
  'Peru':                     'PE',
  'Philippines':              'PH',
  'Poland':                   'PL',
  'Portugal':                 'PT',
  'Qatar':                    'QA',
  'Romania':                  'RO',
  'Russia':                   'RU',
  'Saudi Arabia':             'SA',
  'Scotland':                 'GB-SCT',
  'Senegal':                  'SN',
  'Serbia':                   'RS',
  'Slovakia':                 'SK',
  'Slovenia':                 'SI',
  'South Africa':             'ZA',
  'South Korea':              'KR',
  'Spain':                    'ES',
  'Sweden':                   'SE',
  'Switzerland':              'CH',
  'Syria':                    'SY',
  'Tanzania':                 'TZ',
  'Thailand':                 'TH',
  'Tunisia':                  'TN',
  'Turkey':                   'TR',
  'Turkmenistan':             'TM',
  'Uganda':                   'UG',
  'Ukraine':                  'UA',
  'United Arab Emirates':     'AE',
  'United States':            'US',
  'Uruguay':                  'UY',
  'Uzbekistan':               'UZ',
  'Venezuela':                'VE',
  'Vietnam':                  'VN',
  'Wales':                    'GB-WLS',
  'Zambia':                   'ZM',
  'Zimbabwe':                 'ZW',
}

export function getFlag(teamName) {
  const iso = TEAM_ISO[teamName]
  if (!iso) return '🏳️'
  // Handle GB subdivisions (no emoji support — use GB flag)
  if (iso.startsWith('GB-')) return isoToEmoji('GB')
  if (iso === 'XK') return '🇽🇰' // Kosovo (unofficial)
  return isoToEmoji(iso)
}

// Trigger the edge function manually
export async function triggerOddsRefresh() {
  const { data, error } = await supabase.functions.invoke('fetch-odds')
  return { data, error }
}
