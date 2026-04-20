import { useState, useEffect, useCallback, useRef } from 'react'
import { getNews } from '../api'
import { NewsArticle } from '../types'

// =============================================================================
// ⚙️  CONFIGURAÇÃO — substitua aqui suas chaves de API
// =============================================================================
const BRAPI_TOKEN    = import.meta.env.VITE_BRAPI_API_KEY
const TWELVEDATA_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY

console.log('BRAPI:', import.meta.env.VITE_BRAPI_API_KEY)
console.log('TD:', import.meta.env.VITE_TWELVEDATA_API_KEY)
// Intervalo de atualização automática dos gráficos (em ms). 60000 = 1 minuto.
const REFRESH_INTERVAL_MS = 60_000

// =============================================================================
// MAPA de ativos fixos
// type → 'brapi' | 'td_forex' | 'td_commodity' | 'td_index'
// symbol_td → símbolo usado no Twelve Data
// =============================================================================
const ASSET_CONFIG = [
  {
    id: 'petroleo', label: 'Petróleo Brent', name: 'Energia',
    type: 'td_commodity' as const, symbol_td: 'BRENT',
    question: 'Como a geopolítica do Oriente Médio está impactando o preço do Petróleo Brent?',
    news: [
      { tag:'Energia',  headline:'OPEP+ mantém cortes — petróleo sobe com tensões no Golfo Pérsico', meta:'Reuters · há 23 min', q:'Como a produção da OPEP+ afeta o petróleo diante das tensões no Oriente Médio?' },
      { tag:'Energia',  headline:'IEA alerta para risco de novo choque de oferta em 2026',            meta:'Bloomberg · há 1h',   q:'Qual o risco de um choque de oferta de petróleo em 2026?' },
      { tag:'Energia',  headline:'Rota de Hormuz sob vigilância após ameaças iranianas',              meta:'FT · há 2h',          q:'Como o Estreito de Hormuz afeta o fornecimento global de petróleo?' },
    ],
  },
  {
    id: 'ouro', label: 'Ouro (XAU)', name: 'Safe Haven',
    type: 'td_commodity' as const, symbol_td: 'XAU/USD',
    question: 'Como as tensões geopolíticas globais estão afetando o preço do Ouro?',
    news: [
      { tag:'Safe Haven',    headline:'Ouro atinge novo pico histórico com fuga para ativos seguros',  meta:'Bloomberg · há 15 min', q:'Por que o ouro está subindo e quais os fatores geopolíticos?' },
      { tag:'Banco Central', headline:'Fed sinaliza manutenção de juros — ouro reage positivamente',   meta:'Reuters · há 50 min',   q:'Como a política do Fed impacta o ouro em instabilidade global?' },
    ],
  },
  {
    id: 'eurusd', label: 'EUR/USD', name: 'Câmbio',
    type: 'td_forex' as const, symbol_td: 'EUR/USD',
    question: 'Qual o impacto das sanções à Rússia e da guerra na Ucrânia no câmbio EUR/USD?',
    news: [
      { tag:'Câmbio', headline:'Euro cai com incerteza sobre novo pacote de sanções à Rússia', meta:'Bloomberg · há 41 min',  q:'Qual o impacto das sanções europeias à Rússia no euro?' },
      { tag:'BCE',    headline:'BCE mantém postura cautelosa diante de riscos geopolíticos',   meta:'Euronews · há 1h 10min', q:'Como o BCE está sendo influenciado pelos conflitos na Europa?' },
    ],
  },
  {
    id: 'sp500', label: 'S&P 500', name: 'Índice',
    type: 'td_index' as const, symbol_td: 'SPY',
    question: 'Como as tensões geopolíticas globais estão pressionando o S&P 500?',
    news: [
      { tag:'Mercados', headline:'Wall Street recua com temores sobre semicondutores e Taiwan', meta:'WSJ · há 1h 20min', q:'Qual o impacto geopolítico da tensão em Taiwan no S&P 500?' },
      { tag:'Tech',     headline:'NVDA e TSMC sob pressão com restrições de exportação',       meta:'Bloomberg · há 2h', q:'Como as restrições de chips afetam as big techs?' },
    ],
  },
  {
    id: 'trigo', label: 'Trigo', name: 'Grãos',
    type: 'td_commodity' as const, symbol_td: 'WHEAT',
    question: 'Como a guerra na Ucrânia impacta o mercado global de trigo e grãos?',
    news: [
      { tag:'Grãos', headline:'Corredor do Mar Negro sob pressão — trigo atinge máxima em 3 meses', meta:'FT · há 1h',         q:'Como a guerra na Ucrânia impacta o mercado global de trigo?' },
      { tag:'Agro',  headline:'Brasil amplia exportações de soja com crise de abastecimento',      meta:'Valor · há 1h 30min', q:'Como o Brasil se beneficia do mercado de grãos em meio às tensões?' },
    ],
  },
  {
    id: 'brl', label: 'USD/BRL', name: 'Câmbio BR',
    type: 'td_forex' as const, symbol_td: 'USD/BRL',
    question: 'Qual o efeito da instabilidade geopolítica global no Real brasileiro?',
    news: [
      { tag:'Brasil', headline:'Real estável apesar de volatilidade global — Copom em foco',   meta:'Valor · há 30 min',     q:'Qual o efeito da instabilidade geopolítica no Real?' },
      { tag:'EM',     headline:'Mercados emergentes resistem à aversão ao risco global',       meta:'Bloomberg · há 1h 45min', q:'Como os emergentes estão se comportando diante das tensões?' },
    ],
  },
]

// =============================================================================
// TIPOS
// =============================================================================
type ArticleWithImage = NewsArticle & { relative_time?: string; imageUrl?: string }
type AssetDir = 'up' | 'dn' | 'flat'

interface LiveAsset {
  id:       string
  label:    string
  name:     string
  price:    string
  change:   string
  dir:      AssetDir
  data:     number[]
  question: string
  news:     { tag: string; headline: string; meta: string; q: string }[]
  loading:  boolean
  error:    boolean
}

interface SearchResult {
  ticker:   string
  name:     string
  price:    string
  change:   string
  dir:      AssetDir
  data:     number[]
  currency: string
  source:   'brapi' | 'twelvedata'
}

interface WatchItem {
  ticker:   string
  name:     string
  price:    string
  change:   string
  dir:      AssetDir
  addedAt:  number
}

interface NewsTabProps {
  onAskInChat?: (question: string) => void
}

// =============================================================================
// HELPERS DE FALLBACK
// =============================================================================
const FALLBACK_DATA: Record<string, number[]> = {
  petroleo: [83,84.5,85,84.2,86,87.2,86.1,87.8,87,88.2,87.1,87.8,87.4,87.2,87.14],
  ouro:     [2310,2330,2340,2325,2350,2358,2355,2368,2362,2374,2378,2380,2384,2386,2387],
  eurusd:   [1.09,1.085,1.092,1.088,1.090,1.087,1.084,1.086,1.083,1.081,1.085,1.082,1.084,1.083,1.0842],
  sp500:    [5280,5270,5262,5274,5265,5252,5242,5254,5244,5232,5222,5218,5215,5219,5218],
  trigo:    [5.4,5.5,5.56,5.55,5.68,5.65,5.74,5.79,5.78,5.82,5.85,5.83,5.86,5.84,5.84],
  brl:      [5.10,5.12,5.15,5.13,5.16,5.14,5.17,5.15,5.16,5.14,5.15,5.14,5.13,5.14,5.14],
}
const FALLBACK_PRICES: Record<string, string> = {
  petroleo:'$87.14', ouro:'$2.387', eurusd:'1.0842', sp500:'5.218', trigo:'$5.84', brl:'5.14',
}

// =============================================================================
// FUNÇÕES DE BUSCA — TWELVE DATA
// Documentação: https://twelvedata.com/docs
// 800 req/dia no plano free — muito mais generoso que Alpha Vantage
// =============================================================================

/**
 * Função base — busca série temporal de qualquer símbolo no Twelve Data
 * Funciona para ações (AAPL, SPY), forex (EUR/USD), commodities (XAU/USD, BRENT, WHEAT)
 */
async function fetchTDSeries(symbol: string): Promise<{ price: number; history: number[] }> {
  console.log('TD KEY:', import.meta.env.VITE_TWELVEDATA_API_KEY)
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=15&apikey=${TWELVEDATA_KEY}`
  console.log('TD URL:', url)
  const res  = await fetch(url)
  const json = await res.json()
  console.log('TD response:', json)

  if (json.status === 'error') throw new Error(`TD: ${json.message}`)
  if (!json.values?.length)    throw new Error('TD: sem dados para ' + symbol)

  const history = json.values.map((v: any) => parseFloat(v.close)).reverse()
  return { price: history[history.length - 1], history }
}
/**
 * Forex (ex: EUR/USD, USD/BRL) — usa a mesma função base
 */
async function fetchTDForex(pair: string): Promise<{ price: number; history: number[] }> {
  return fetchTDSeries(pair)
}

/**
 * Commodities (ex: XAU/USD, BRENT, WHEAT) — usa a mesma função base
 */
async function fetchTDCommodity(symbol: string): Promise<{ price: number; history: number[] }> {
  return fetchTDSeries(symbol)
}

/**
 * Autocomplete de tickers — endpoint /symbol_search do Twelve Data
 */
async function searchTDSymbol(query: string): Promise<{ symbol: string; name: string }[]> {
  const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${TWELVEDATA_KEY}`
  const res  = await fetch(url)
  const json = await res.json()
  return (json.data ?? []).slice(0, 5).map((m: any) => ({
    symbol: m.symbol,
    name:   m.instrument_name,
  }))
}

// =============================================================================
// FUNÇÕES DE BUSCA — BRAPI (ações BR, FIIs, cripto)
// =============================================================================
async function fetchBRAPI(ticker: string): Promise<{ price: number; change: number; history: number[]; name: string }> {
  const url = `https://brapi.dev/api/quote/${ticker}?range=1d&interval=1h&token=${BRAPI_TOKEN}`
  const res  = await fetch(url)
  const json = await res.json()
  const result = json.results?.[0]
  if (!result) throw new Error('BRAPI: sem dados para ' + ticker)
  const history = result.historicalDataPrice?.map((p: any) => p.close).filter(Boolean) ?? [result.regularMarketPrice]
  return {
    price:   result.regularMarketPrice,
    change:  result.regularMarketChangePercent,
    history,
    name:    result.longName || result.shortName || ticker,
  }
}

async function fetchBRAPIMultiple(tickers: string[]): Promise<Record<string, { price: number; change: number; name: string }>> {
  if (!tickers.length) return {}
  const url  = `https://brapi.dev/api/quote/${tickers.join(',')}?token=${BRAPI_TOKEN}`
  const res  = await fetch(url)
  const json = await res.json()
  const out: Record<string, { price: number; change: number; name: string }> = {}
  for (const r of json.results ?? []) {
    out[r.symbol] = {
      price:  r.regularMarketPrice,
      change: r.regularMarketChangePercent,
      name:   r.longName || r.shortName || r.symbol,
    }
  }
  return out
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================
const proxyImg = (url: string) =>
  url ? `http://localhost:8000/api/image-proxy?url=${encodeURIComponent(url)}` : ''

function dirFromChange(change: number): AssetDir {
  if (change > 0.01) return 'up'
  if (change < -0.01) return 'dn'
  return 'flat'
}

function colorFromDir(dir: AssetDir) {
  return dir === 'up' ? '#22c55e' : dir === 'dn' ? '#ef4444' : '#8b8aa0'
}

function formatPrice(price: number, decimals = 2) {
  if (price > 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return price.toFixed(decimals)
}

function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string) {
  if (!canvas || !data.length) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
  ctx.beginPath()
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * (w - 4) + 2
    const y = (h - 4) - ((v - mn) / rng) * (h - 8) + 4
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  const lv = data[data.length - 1]
  const lx = w - 2
  const ly = (h - 4) - ((lv - mn) / rng) * (h - 8) + 4
  ctx.beginPath()
  ctx.arc(lx, ly, 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function drawMainChart(canvas: HTMLCanvasElement, data: number[], color: string) {
  if (!canvas || !data.length) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1

  ctx.strokeStyle = 'rgba(167,139,250,0.06)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = 8 + (i * (h - 16)) / 4
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  ctx.beginPath()
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = (h - 8) - ((v - mn) / rng) * (h - 16) + 8
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, color + '28')
  grad.addColorStop(1, color + '00')
  ctx.fillStyle = grad; ctx.fill()

  ctx.beginPath()
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = (h - 8) - ((v - mn) / rng) * (h - 16) + 8
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()

  const lv = data[data.length - 1]
  const lx = w
  const ly = (h - 8) - ((lv - mn) / rng) * (h - 16) + 8
  ctx.beginPath(); ctx.arc(lx - 2, ly, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.beginPath(); ctx.arc(lx - 2, ly, 6, 0, Math.PI * 2)
  ctx.fillStyle = color + '33'; ctx.fill()
}

// =============================================================================
// HOOK — busca e atualiza todos os ativos fixos em tempo real
// =============================================================================
function useLiveAssets(): { assets: LiveAsset[]; lastUpdate: Date | null; refresh: () => void } {
  const initAssets = (): LiveAsset[] =>
    ASSET_CONFIG.map(cfg => ({
      ...cfg,
      price:   FALLBACK_PRICES[cfg.id] ?? '—',
      change:  '—',
      dir:     'flat' as AssetDir,
      data:    FALLBACK_DATA[cfg.id] ?? [],
      loading: true,
      error:   false,
    }))

  const [assets, setAssets]         = useState<LiveAsset[]>(initAssets)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchOne = useCallback(async (cfg: typeof ASSET_CONFIG[0]) => {
    try {
      let price = 0, history: number[] = [], prevClose = 0

      if (cfg.type === 'td_forex') {
        const r = await fetchTDForex(cfg.symbol_td)
        price = r.price; history = r.history
      } else if (cfg.type === 'td_commodity') {
        const r = await fetchTDCommodity(cfg.symbol_td)
        price = r.price; history = r.history
      } else {
        const r = await fetchTDSeries(cfg.symbol_td)
        price = r.price; history = r.history
      }

      prevClose = history.length > 1 ? history[history.length - 2] : price
      const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0
      const dir       = dirFromChange(changePct)
      const decimals  = cfg.id === 'eurusd' || cfg.id === 'brl' ? 4 : 2

      setAssets(prev => prev.map(a =>
        a.id === cfg.id
          ? {
              ...a,
              price:   (cfg.id === 'ouro' || cfg.id === 'petroleo' || cfg.id === 'trigo' || cfg.id === 'sp500')
                         ? `$${formatPrice(price)}`
                         : formatPrice(price, decimals),
              change:  `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
              dir,
              data:    history,
              loading: false,
              error:   false,
            }
          : a
      ))
    } catch {
      setAssets(prev => prev.map(a =>
        a.id === cfg.id ? { ...a, loading: false, error: true } : a
      ))
    }
  }, [])

  const refresh = useCallback(() => {
    setAssets(prev => prev.map(a => ({ ...a, loading: true })))
    Promise.all(ASSET_CONFIG.map(fetchOne)).then(() => setLastUpdate(new Date()))
  }, [fetchOne])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return { assets, lastUpdate, refresh }
}

// =============================================================================
// HOOK — watchlist persistida no localStorage
// =============================================================================
const WATCHLIST_KEY = 'geo_watchlist_v1'

function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '[]') }
    catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items))
  }, [items])

  const add = useCallback((item: WatchItem) => {
    setItems(prev => prev.find(i => i.ticker === item.ticker) ? prev : [item, ...prev])
  }, [])

  const remove = useCallback((ticker: string) => {
    setItems(prev => prev.filter(i => i.ticker !== ticker))
  }, [])

  const refreshPrices = useCallback(async (currentItems: WatchItem[]) => {
    if (!currentItems.length) return
    try {
      const tickers = currentItems.map(i => i.ticker)
      const prices  = await fetchBRAPIMultiple(tickers)
      setItems(prev => prev.map(item => {
        const live = prices[item.ticker]
        if (!live) return item
        return {
          ...item,
          price:  `R$ ${live.price.toFixed(2)}`,
          change: `${live.change >= 0 ? '+' : ''}${live.change.toFixed(2)}%`,
          dir:    dirFromChange(live.change),
          name:   live.name || item.name,
        }
      }))
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    refreshPrices(items)
    const timer = setInterval(() => refreshPrices(items), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { items, add, remove }
}

// =============================================================================
// COMPONENTE — Sparkline
// =============================================================================
function Sparkline({ data, color, width = 90, height = 20 }: {
  data: number[]; color: string; width?: number; height?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawSparkline(ref.current, data, color)
  }, [data, color])
  return <canvas ref={ref} width={width} height={height} style={{ display:'block', width:'100%', height }} />
}

// =============================================================================
// COMPONENTE — Bloomberg Card
// =============================================================================
function BloombergCard({ assets, onAskInChat }: { assets: LiveAsset[]; onAskInChat?: (q: string) => void }) {
  const [activeId, setActiveId] = useState('petroleo')
  const mainChartRef = useRef<HTMLCanvasElement>(null)
  const active = assets.find(a => a.id === activeId) ?? assets[0]
  const color  = colorFromDir(active?.dir ?? 'flat')

  useEffect(() => {
    if (mainChartRef.current && active?.data?.length) {
      drawMainChart(mainChartRef.current, active.data, color)
    }
  }, [activeId, active?.data, color])

  return (
    <div style={{ background:'var(--bg-card-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px 9px', borderBottom:'1px solid var(--border-subtle)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:2, background:'var(--accent-amber)' }} />
          <span style={{ fontSize:11, fontWeight:600, color:'var(--accent-amber)', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'var(--font-grotesk)' }}>
            Mercados & Economia
          </span>
          <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:4 }}>ao vivo · atualiza a cada 60s</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', animation:'status-pulse 2s infinite' }} />
          <span style={{ fontSize:10, color:'#22c55e' }}>live</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', borderBottom:'1px solid var(--border-subtle)' }}>
        {assets.map(asset => {
          const c     = colorFromDir(asset.dir)
          const arrow = asset.dir === 'up' ? '▲' : asset.dir === 'dn' ? '▼' : '—'
          const isAct = asset.id === activeId
          return (
            <div
              key={asset.id}
              onClick={() => setActiveId(asset.id)}
              style={{
                padding:'10px 12px 8px',
                borderRight:'1px solid var(--border-subtle)',
                cursor:'pointer',
                background: isAct ? 'rgba(167,139,250,0.05)' : 'transparent',
                borderBottom: isAct ? '2px solid var(--accent-amber)' : '2px solid transparent',
                transition:'all 0.15s',
                opacity: asset.loading ? 0.6 : 1,
              }}
            >
              <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{asset.name}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)', letterSpacing:'-0.01em' }}>{asset.label}</div>
              <div style={{ fontSize:11, fontWeight:600, color:c, marginTop:2 }}>{asset.loading ? '…' : asset.price}</div>
              <div style={{ fontSize:10, color:c, marginTop:1 }}>
                {asset.loading ? '' : `${arrow} ${asset.change}`}
                {asset.error && <span style={{ color:'var(--text-muted)', fontSize:9 }}> ⚠</span>}
              </div>
              <Sparkline data={asset.data} color={c} width={90} height={20} />
            </div>
          )
        })}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
        <div style={{ padding:'12px 16px 14px', borderRight:'1px solid var(--border-subtle)' }}>
          {active && (
            <>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)' }}>{active.label}</span>
                  <span style={{ fontSize:11, color, marginLeft:8, fontWeight:500 }}>
                    {active.loading ? 'carregando…' : `${active.price} ${active.dir === 'up' ? '▲' : active.dir === 'dn' ? '▼' : '—'} ${active.change}`}
                  </span>
                </div>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>últimas 24h</span>
              </div>
              <canvas
                ref={mainChartRef}
                width={280} height={72}
                style={{ display:'block', width:'100%', height:72, cursor:'pointer' }}
                onClick={() => onAskInChat?.(active.question)}
                title="Clique para analisar no chat"
              />
            </>
          )}
          {onAskInChat && active && (
            <button
              onClick={() => onAskInChat(active.question)}
              style={{ marginTop:10, width:'100%', padding:'7px 12px', background:'var(--accent-subtle)', border:'1px solid var(--border-active)', borderRadius:'var(--radius-sm)', color:'var(--accent)', fontSize:11, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-main)', display:'flex', alignItems:'center', justifyContent:'center', gap:5, transition:'all 0.15s' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.16)')}
              onMouseOut={e  => (e.currentTarget.style.background = 'var(--accent-subtle)')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 1H2a1 1 0 00-1 1v9a1 1 0 001 1h3v3l4-3h5a1 1 0 001-1V2a1 1 0 00-1-1z"/></svg>
              Analisar no Chat ↗
            </button>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column' }}>
          {active?.news.map((n, i) => (
            <div
              key={i}
              onClick={() => onAskInChat?.(n.q)}
              style={{ padding:'10px 14px', borderBottom: i < (active.news.length - 1) ? '1px solid var(--border-subtle)' : 'none', cursor:'pointer', display:'flex', gap:10, alignItems:'flex-start', transition:'background 0.12s' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.04)')}
              onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ padding:'2px 6px', borderRadius:3, fontSize:9, fontWeight:700, background:'var(--accent-amber-subtle)', color:'var(--accent-amber)', border:'1px solid rgba(245,158,11,0.2)', whiteSpace:'nowrap', flexShrink:0, marginTop:1, letterSpacing:'0.04em' }}>{n.tag}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.45 }}>{n.headline}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>{n.meta}</div>
              </div>
              <span style={{ color:'var(--text-muted)', fontSize:11, flexShrink:0, marginTop:1 }}>↗</span>
            </div>
          ))}
          {onAskInChat && (
            <div style={{ padding:'8px 14px', marginTop:'auto', borderTop:'1px solid var(--border-subtle)' }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Pergunte ao agente</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {assets.filter(a => a.id !== activeId).slice(0, 2).map(a => (
                  <button
                    key={a.id}
                    onClick={() => onAskInChat(a.question)}
                    style={{ background:'none', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--text-muted)', fontSize:10, cursor:'pointer', fontFamily:'var(--font-main)', textAlign:'left', transition:'all 0.12s' }}
                    onMouseOver={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.borderColor='rgba(167,139,250,0.3)' }}
                    onMouseOut={e  => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.borderColor='var(--border-subtle)' }}
                  >
                    ↗ Analisar {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// COMPONENTE — Asset Search (agora com Twelve Data + autocomplete)
// =============================================================================
function AssetSearch({ onAskInChat, onAddToWatchlist }: {
  onAskInChat?: (q: string) => void
  onAddToWatchlist?: (item: WatchItem) => void
}) {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<SearchResult[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([])
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autocomplete via Twelve Data
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const s = await searchTDSymbol(query)
        setSuggestions(s)
      } catch { setSuggestions([]) }
    }, 400)
  }, [query])

  const search = async (ticker: string) => {
    if (!ticker.trim()) return
    setLoading(true); setError(''); setResults([]); setSuggestions([])
    const t = ticker.trim().toUpperCase()
    const attempts: SearchResult[] = []
  
    // Só tenta BRAPI para tickers BR (terminam em número ou são cripto conhecida)
    const isBR = /\d$/.test(t) || ['BTC','ETH','BNB','SOL'].includes(t)
  
    if (isBR) {
      try {
        const r = await fetchBRAPI(t)
        const dir = dirFromChange(r.change)
        attempts.push({
          ticker: t, name: r.name,
          price:  `R$ ${r.price.toFixed(2)}`,
          change: `${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}%`,
          dir, data: r.history, currency: 'BRL', source: 'brapi',
        })
      } catch { /* tenta TD */ }
    }
  
    // Twelve Data para tudo que não achou no BRAPI
    if (!attempts.length) {
      try {
        const r = await fetchTDSeries(t)
        const prev = r.history.length > 1 ? r.history[r.history.length - 2] : r.price
        const chg  = prev ? ((r.price - prev) / prev) * 100 : 0
        const dir  = dirFromChange(chg)
        attempts.push({
          ticker: t, name: t,
          price:  `$${formatPrice(r.price)}`,
          change: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
          dir, data: r.history, currency: 'USD', source: 'twelvedata',
        })
      } catch { /* sem resultado */ }
    }
  
    if (attempts.length) {
      setResults(attempts)
    } else {
      setError(`Ativo "${t}" não encontrado. Tente: PETR4, AAPL, BTC, EUR/USD, TSLA…`)
    }
    setLoading(false)
  }

  return (
    <div style={{ background:'var(--bg-card-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-lg)', overflow:'visible', padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <div style={{ width:7, height:7, borderRadius:2, background:'var(--accent)' }} />
        <span style={{ fontSize:11, fontWeight:600, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'var(--font-grotesk)' }}>
          Buscar Ativo
        </span>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>BRAPI + Twelve Data</span>
      </div>

      <div style={{ position:'relative' }}>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ flex:1, position:'relative' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(query)}
              placeholder="Digite o ticker: PETR4, AAPL, BTC, EUR/USD, TSLA…"
              style={{ width:'100%', padding:'9px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)', color:'var(--text-primary)', fontSize:13, fontFamily:'var(--font-main)', outline:'none', transition:'border-color 0.15s' }}
              onFocus={e  => (e.target.style.borderColor = 'rgba(167,139,250,0.4)')}
              onBlur={e   => (e.target.style.borderColor = 'var(--border-subtle)')}
            />
            {suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--bg-card-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)', zIndex:50, overflow:'hidden' }}>
                {suggestions.map((s, i) => (
                  <div
                    key={`suggestion-${i}`}
                    onClick={() => { setQuery(s.symbol); search(s.symbol) }}
                    style={{ padding:'8px 12px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', transition:'background 0.1s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.06)')}
                    onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)', minWidth:60, fontFamily:'var(--font-grotesk)' }}>{s.symbol}</span>
                    <span style={{ fontSize:11, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => search(query)}
            disabled={loading || !query.trim()}
            style={{ padding:'9px 18px', background:'var(--accent-strong)', border:'none', borderRadius:'var(--radius-md)', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-main)', opacity: loading || !query.trim() ? 0.5 : 1, transition:'all 0.15s', whiteSpace:'nowrap' }}
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
      {['PETR4','VALE3','AAPL','TSLA','BTC','EUR/USD'].map(ex => (
        <button
          key={`example-${ex}`}
            onClick={() => { setQuery(ex); search(ex) }}
            style={{ padding:'3px 9px', background:'none', border:'1px solid var(--border-subtle)', borderRadius:20, color:'var(--text-muted)', fontSize:10, cursor:'pointer', fontFamily:'var(--font-grotesk)', transition:'all 0.12s' }}
            onMouseOver={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.borderColor='rgba(167,139,250,0.3)' }}
            onMouseOut={e  => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.borderColor='var(--border-subtle)' }}
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'var(--radius-sm)', color:'#ef4444', fontSize:12 }}>
          {error}
        </div>
      )}

      {results.map(r => {
        const c = colorFromDir(r.dir)
        const arrow = r.dir === 'up' ? '▲' : r.dir === 'dn' ? '▼' : '—'
        return (
          <div
            key={r.ticker}
            style={{ marginTop:12, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)', padding:'12px 14px', display:'flex', gap:16, alignItems:'center' }}
          >
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:2 }}>
                <span style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)' }}>{r.ticker}</span>
                <span style={{ fontSize:10, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <span style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)' }}>{r.price}</span>
                <span style={{ fontSize:13, color:c, fontWeight:600 }}>{arrow} {r.change}</span>
              </div>
              <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                via {r.source === 'brapi' ? 'BRAPI' : 'Twelve Data'} · {r.currency}
              </div>
            </div>
            <div style={{ width:120, flexShrink:0 }}>
              <Sparkline data={r.data} color={c} width={120} height={36} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
              {onAskInChat && (
                <button
                  onClick={() => onAskInChat(`Analise o ativo ${r.ticker} (${r.name}) com contexto geopolítico: preço atual ${r.price}, variação ${r.change}`)}
                  style={{ padding:'6px 12px', background:'var(--accent-subtle)', border:'1px solid var(--border-active)', borderRadius:'var(--radius-sm)', color:'var(--accent)', fontSize:11, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-main)', whiteSpace:'nowrap' }}
                >
                  Analisar ↗
                </button>
              )}
              {onAddToWatchlist && (
                <button
                  onClick={() => onAddToWatchlist({ ticker: r.ticker, name: r.name, price: r.price, change: r.change, dir: r.dir, addedAt: Date.now() })}
                  style={{ padding:'6px 12px', background:'none', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', color:'var(--text-muted)', fontSize:11, cursor:'pointer', fontFamily:'var(--font-main)', whiteSpace:'nowrap', transition:'all 0.12s' }}
                  onMouseOver={e => { e.currentTarget.style.color='var(--text-primary)'; e.currentTarget.style.borderColor='var(--border-active)' }}
                  onMouseOut={e  => { e.currentTarget.style.color='var(--text-muted)';   e.currentTarget.style.borderColor='var(--border-subtle)' }}
                >
                  + Watchlist
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// COMPONENTE — Watchlist
// =============================================================================
function WatchlistPanel({ items, onRemove, onAskInChat }: {
  items: WatchItem[]
  onRemove: (ticker: string) => void
  onAskInChat?: (q: string) => void
}) {
  if (!items.length) return null
  return (
    <div style={{ background:'var(--bg-card-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px 9px', borderBottom:'1px solid var(--border-subtle)' }}>
        <div style={{ width:7, height:7, borderRadius:2, background:'#22c55e' }} />
        <span style={{ fontSize:11, fontWeight:600, color:'#22c55e', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'var(--font-grotesk)' }}>
          Minha Watchlist
        </span>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>{items.length} ativo{items.length !== 1 ? 's' : ''} · atualiza a cada 60s</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:0 }}>
        {items.map((item, i) => {
          const c     = colorFromDir(item.dir)
          const arrow = item.dir === 'up' ? '▲' : item.dir === 'dn' ? '▼' : '—'
          return (
            <div
              key={item.ticker}
              style={{ padding:'10px 14px', borderRight: (i + 1) % 4 !== 0 ? '1px solid var(--border-subtle)' : 'none', borderBottom:'1px solid var(--border-subtle)', position:'relative' }}
            >
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)' }}>{item.ticker}</div>
                <button
                  onClick={() => onRemove(item.ticker)}
                  style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:12, padding:0, lineHeight:1, opacity:0.5, transition:'opacity 0.12s' }}
                  onMouseOver={e => (e.currentTarget.style.opacity = '1')}
                  onMouseOut={e  => (e.currentTarget.style.opacity = '0.5')}
                >✕</button>
              </div>
              <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-grotesk)', marginBottom:2 }}>{item.price}</div>
              <div style={{ fontSize:11, color:c, fontWeight:500, marginBottom:6 }}>{arrow} {item.change}</div>
              {onAskInChat && (
                <button
                  onClick={() => onAskInChat(`Analise o ativo ${item.ticker} e seu contexto geopolítico atual. Preço: ${item.price}, variação: ${item.change}.`)}
                  style={{ fontSize:10, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-main)', padding:0 }}
                >
                  Analisar ↗
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// CATEGORIAS DE NOTÍCIAS
// =============================================================================
const FILTERS = [
  { key: 'all',         label: 'Todos'         },
  { key: 'middle-east', label: 'Oriente Médio' },
  { key: 'europe',      label: 'Europa'        },
  { key: 'brazil',      label: 'Brasil'        },
  { key: 'economy',     label: 'Economia'      },
]
const CATEGORY_COLOR: Record<string, string> = {
  'middle-east': '#E24B4A',
  'europe':      '#378ADD',
  'brazil':      '#1D9E75',
  'economy':     '#f59e0b',
}
const FALLBACK_IMAGES: Record<string, string> = {
  'middle-east': 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600&h=300&fit=crop',
  'europe':      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&h=300&fit=crop',
  'brazil':      'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&h=300&fit=crop',
}
const FALLBACK_DEFAULT = 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&h=300&fit=crop'

function resolveArticle(article: ArticleWithImage) {
  const color    = CATEGORY_COLOR[article.categoryKey || ''] || '#8B949E'
  const fallback = FALLBACK_IMAGES[article.categoryKey || ''] || FALLBACK_DEFAULT
  const imgSrc   = article.imageUrl || fallback
  return { color, fallback, imgSrc }
}

function HeroCard({ article, onClick }: { article: ArticleWithImage; onClick: () => void }) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)
  return (
    <div className="news-hero-card" onClick={onClick}>
      <div className="news-hero-img">
        <img src={imgErr ? fallback : proxyImg(imgSrc)} alt={article.title} onError={() => setImgErr(true)} />
        {article.category && <span className="news-card-badge" style={{ background: color }}>{article.category}</span>}
      </div>
      <div className="news-hero-body">
        <div className="article-row-meta">
          <span className="article-source">{article.source}</span>
          {article.relative_time && (<><span className="meta-sep">·</span><span className="article-time">{article.relative_time}</span></>)}
        </div>
        <div className="news-hero-title">{article.title}</div>
        {article.description && <div className="news-hero-desc">{article.description}</div>}
        <span className="news-read-more" style={{ color }}>Ler mais →</span>
      </div>
    </div>
  )
}

function NewsCard({ article, onClick }: { article: ArticleWithImage; onClick: () => void }) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)
  return (
    <div className="news-card" onClick={onClick}>
      <div className="news-card-img">
        <img src={imgErr ? fallback : proxyImg(imgSrc)} alt={article.title} onError={() => setImgErr(true)} />
        {article.category && <span className="news-card-badge" style={{ background: color }}>{article.category}</span>}
      </div>
      <div className="news-card-body">
        <div className="article-row-meta">
          <span className="article-source">{article.source}</span>
          {article.relative_time && (<><span className="meta-sep">·</span><span className="article-time">{article.relative_time}</span></>)}
        </div>
        <div className="news-card-title">{article.title}</div>
        {article.description && <div className="news-card-desc">{article.description}</div>}
      </div>
    </div>
  )
}

function ArticleModal({ article, onClose, onAskInChat }: {
  article: ArticleWithImage; onClose: () => void; onAskInChat?: (q: string) => void
}) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)

  // Fecha com ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-img-wrap">
          <img src={imgErr ? fallback : proxyImg(imgSrc)} alt={article.title} onError={() => setImgErr(true)} />
          {article.category && <span className="news-card-badge" style={{ background: color }}>{article.category}</span>}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="article-row-meta" style={{ marginBottom: 8 }}>
            <span className="article-source">{article.source}</span>
            {article.relative_time && (<><span className="meta-sep">·</span><span className="article-time">{article.relative_time}</span></>)}
          </div>
          <h3>{article.title}</h3>
          {article.description && <p>{article.description}</p>}
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            {article.url && (
              <a
                className="modal-link"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                Ver artigo original →
              </a>
            )}
            {onAskInChat && (
              <button
                onClick={() => { onAskInChat(`Analise o contexto geopolítico desta notícia: "${article.title}"`); onClose() }}
                style={{ background:'var(--accent-subtle)', border:'1px solid var(--border-active)', borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--accent)', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-main)' }}
              >
                Analisar no Chat ↗
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// COMPONENTE PRINCIPAL — NewsTab
// =============================================================================
export default function NewsTab({ onAskInChat }: NewsTabProps) {
  const { assets, refresh: refreshAssets } = useLiveAssets()
  const { items: watchlist, add: addToWatch, remove: removeFromWatch } = useWatchlist()

  const [articles, setArticles]       = useState<ArticleWithImage[]>([])
  const [filter, setFilter]           = useState('all')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<ArticleWithImage | null>(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getNews({ max_results: 40 })
      if (result.articles?.length > 0) {
        setArticles(result.articles)
        setLastUpdated(new Date())
      }
    } catch (e) { console.warn('Falha ao buscar notícias:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchNews()
    const t = setInterval(fetchNews, 15 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchNews])

  const filtered = articles.filter(a => {
    const matchFilter = filter === 'all' || a.categoryKey === filter
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const showMarkets = filter === 'all' || filter === 'economy'
  const hero = filter === 'all' && !search ? filtered[0] : null
  const rest = hero ? filtered.slice(1) : filtered

  return (
    <div className="news-page">
      <div className="news-header">
        <div className="news-header-top">
          <div>
            <h2>Notícias</h2>
            {lastUpdated && (
              <span className="news-updated">
                atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
              </span>
            )}
          </div>
          <button className="news-refresh-btn" onClick={() => { fetchNews(); refreshAssets() }} disabled={loading} title="Atualizar">
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <path d="M1.5 7.5A6 6 0 0 1 12 3M13.5 7.5A6 6 0 0 1 3 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M12 3V6.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="news-search-wrap">
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none" style={{ flexShrink:0, opacity:0.4 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input className="news-search-input" type="text" placeholder="Buscar notícias..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button className="news-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="news-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`news-filter-chip ${filter === f.key ? 'active' : ''}`}
              style={filter === f.key && f.key !== 'all' ? { borderColor:CATEGORY_COLOR[f.key], color:CATEGORY_COLOR[f.key], background:`${CATEGORY_COLOR[f.key]}18` } : {}}
              onClick={() => setFilter(f.key)}
            >
              {f.key !== 'all' && <span className="chip-dot" style={{ background: CATEGORY_COLOR[f.key] }} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && articles.length === 0 ? (
        <div className="news-loading">
          <div className="news-loading-dots"><span /><span /><span /></div>
          <span>Buscando notícias em tempo real...</span>
        </div>
      ) : (
        <div className="news-grid-wrap">
          {/* Bloomberg Card — ativos ao vivo */}
          {showMarkets && <BloombergCard assets={assets} onAskInChat={onAskInChat} />}

          {/* Busca de ativo — só em Economia */}
          {filter === 'economy' && (
            <AssetSearch onAskInChat={onAskInChat} onAddToWatchlist={addToWatch} />
          )}

          {/* Watchlist */}
          {showMarkets && watchlist.length > 0 && (
            <WatchlistPanel items={watchlist} onRemove={removeFromWatch} onAskInChat={onAskInChat} />
          )}

          {/* Hero card */}
          {hero && <HeroCard article={hero} onClick={() => setSelected(hero)} />}

          {/* Grid de notícias */}
          {rest.length > 0 && (
            <div className="news-cards-grid">
              {rest.map((article, i) => (
                <NewsCard key={i} article={article} onClick={() => setSelected(article)} />
              ))}
            </div>
          )}

          {filtered.length === 0 && !showMarkets && (
            <div className="news-empty">Nenhuma notícia encontrada.</div>
          )}
        </div>
      )}

      {selected && (
        <ArticleModal article={selected} onClose={() => setSelected(null)} onAskInChat={onAskInChat} />
      )}
    </div>
  )
}