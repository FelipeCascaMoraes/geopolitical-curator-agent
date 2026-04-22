import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatStream } from '../api'
import { ChatMessage } from '../types'

// =============================================================================
// TIPOS E PROPS
// =============================================================================
interface ChatTabProps {
  convId:                      string
  initialMessages:             ChatMessage[]
  onFirstMessage:              (convId: string, question: string) => void
  onMessagesChange:            (convId: string, messages: ChatMessage[]) => void
  pendingQuestion?:            string | null
  onPendingQuestionConsumed?:  () => void
  onNavigateToNews?:           () => void
}

// =============================================================================
// DADOS — Ticker
// =============================================================================
const TICKER_ALERTS = [
  { id:1, severity:'critical', text:'Rússia intensifica ataques em Kharkiv — 19 abr' },
  { id:2, severity:'critical', text:'Central de Zaporizhzhia perde energia — 19 abr' },
  { id:3, severity:'high',     text:'Israel expande operações no sul de Gaza — 19 abr' },
  { id:4, severity:'high',     text:'China realiza exercícios militares próximo a Taiwan — 19 abr' },
  { id:5, severity:'medium',   text:'Venezuela reafirma soberania sobre Essequibo — 19 abr' },
  { id:6, severity:'high',     text:'Coreia do Norte lança míssil balístico — 19 abr' },
  { id:7, severity:'medium',   text:'Golpe de Estado fracassado no Mali — 18 abr' },
  { id:8, severity:'critical', text:'OTAN reforça flanco leste com 3.000 tropas adicionais — 18 abr' },
  { id:9, severity:'medium',   text:'Tensão diplomática entre EUA e Irã sobre acordo nuclear — 18 abr' },
]

// =============================================================================
// DADOS — Conflitos
// =============================================================================
const ACTIVE_CONFLICTS = [
  {
    id:'russia-ukraine', region:'Leste Europeu', name:'Guerra Rússia–Ucrânia',
    risk:'Crítico', riskLevel:4, trend:'up',
    sparkData:[60,62,65,63,68,70,71,73,72,74,75,76,77,76,78],
    color:'#ef4444',
    query:'O que está acontecendo na guerra da Rússia e Ucrânia agora?',
  },
  {
    id:'gaza-israel', region:'Oriente Médio', name:'Conflito Gaza–Israel',
    risk:'Crítico', riskLevel:4, trend:'up',
    sparkData:[55,58,60,62,61,65,64,66,68,70,71,72,73,74,75],
    color:'#ef4444',
    query:'Qual a situação atual do conflito entre Israel e Gaza?',
  },
  {
    id:'taiwan', region:'Ásia-Pacífico', name:'Estreito de Taiwan',
    risk:'Elevado', riskLevel:3, trend:'up',
    sparkData:[40,41,42,44,43,45,46,47,46,48,49,50,51,52,53],
    color:'#f59e0b',
    query:'Como está a tensão militar no Estreito de Taiwan?',
  },
  {
    id:'venezuela', region:'América Latina', name:'Venezuela e Essequibo',
    risk:'Monitorando', riskLevel:2, trend:'stable',
    sparkData:[25,26,25,27,26,28,27,28,29,28,30,29,31,30,31],
    color:'#3b82f6',
    query:'Qual a situação da disputa territorial entre Venezuela e Guiana pelo Essequibo?',
  },
  {
    id:'north-korea', region:'Não-Proliferação', name:'Coreia do Norte',
    risk:'Elevado', riskLevel:3, trend:'up',
    sparkData:[35,36,38,37,39,40,41,43,42,44,45,46,47,48,49],
    color:'#f59e0b',
    query:'Qual o status atual do programa nuclear da Coreia do Norte?',
  },
  {
    id:'sahel', region:'África Sahel', name:'Golpes de Estado',
    risk:'Elevado', riskLevel:3, trend:'stable',
    sparkData:[30,31,32,31,33,32,34,33,35,34,35,36,35,37,36],
    color:'#f59e0b',
    query:'Qual a situação política e os golpes de estado na região do Sahel africano?',
  },
]

// =============================================================================
// DADOS — Mercados
// =============================================================================
const MARKET_SNAPSHOT = [
  { id:'brent',  cat:'Energia',   name:'Petróleo Brent',  value:'$87.14', change:'+1.82%', dir:'up'   as const, query:'Como a geopolítica do Oriente Médio está impactando o preço do Petróleo Brent?' },
  { id:'gold',   cat:'Segurança', name:'Ouro (XAU)',       value:'$2.387', change:'+0.94%', dir:'up'   as const, query:'Como as tensões geopolíticas globais estão afetando o preço do Ouro?' },
  { id:'eurusd', cat:'Câmbio',    name:'EUR/USD',          value:'1.0842', change:'-0.38%', dir:'down' as const, query:'Qual o impacto das sanções à Rússia e da guerra na Ucrânia no câmbio EUR/USD?' },
  { id:'sp500',  cat:'Índice',    name:'S&P 500',          value:'5.218',  change:'-0.61%', dir:'down' as const, query:'Como as tensões geopolíticas globais estão pressionando o S&P 500?' },
  { id:'wheat',  cat:'Grãos',     name:'Trigo (Chicago)',  value:'$5.84',  change:'+2.34%', dir:'up'   as const, query:'Como a guerra na Ucrânia impacta o mercado global de trigo e grãos?' },
  { id:'usdbrl', cat:'Câmbio BR', name:'USD/BRL',          value:'5.14',   change:'0.00%',  dir:'flat' as const, query:'Qual o efeito da instabilidade geopolítica global no Real brasileiro?' },
]

// =============================================================================
// SPEECH-TO-TEXT
// =============================================================================
declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any }
}

function useSpeechRecognition(onResult: (text: string) => void) {
  const recognitionRef = useRef<any>(null)
  const [listening, setListening] = useState(false)
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = () => setListening(false)
    rec.onresult = (e: any) => { onResult(e.results[0][0].transcript) }
    recognitionRef.current = rec; rec.start()
  }, [isSupported, onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop(); setListening(false)
  }, [])

  return { listening, isSupported, startListening, stopListening }
}

// =============================================================================
// SUB-COMPONENTE — Sparkline SVG
// =============================================================================
function SparklineSVG({ data, color, width = 100, height = 40 }: {
  data: number[]; color: string; width?: number; height?: number
}) {
  if (!data.length) return null
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - 4 - ((v - mn) / rng) * (height - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const area = `0,${height} ${pts.join(' ')} ${width},${height}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display:'block', width:'100%', height }} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity="0.15" />
      <polyline points={pts.join(' ')} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={parseFloat(pts[pts.length-1].split(',')[0])}
        cy={parseFloat(pts[pts.length-1].split(',')[1])}
        r="3" fill={color}
      />
    </svg>
  )
}

// =============================================================================
// SUB-COMPONENTE — Ticker
// =============================================================================
function AlertTicker() {
  const items = [...TICKER_ALERTS, ...TICKER_ALERTS]
  const sc = (s: string) => s === 'critical' ? '#ef4444' : s === 'high' ? '#f59e0b' : '#60a5fa'
  return (
    <div className="chat-ticker-bar">
      <div className="chat-ticker-label">
        <span className="chat-ticker-live-dot" />
        AO VIVO
      </div>
      <div className="chat-ticker-track">
        <div className="chat-ticker-inner">
          {items.map((item, i) => (
            <span key={i} className="chat-ticker-item">
              <span className="chat-ticker-dot" style={{ background: sc(item.severity) }} />
              {item.text}
              <span className="chat-ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTE — Cards de Conflitos (AUMENTADOS)
// =============================================================================
function ConflictRiskCards({ onAsk }: { onAsk: (q: string) => void }) {
  const badgeClass = (risk: string) => {
    if (risk === 'Crítico')     return 'risk-badge risk-critical'
    if (risk === 'Elevado')     return 'risk-badge risk-high'
    if (risk === 'Monitorando') return 'risk-badge risk-monitoring'
    return 'risk-badge risk-medium'
  }

  return (
    <div className="chat-section">
      <div className="chat-section-header">
        <div className="chat-section-title">
          <span className="chat-section-accent" />
          Focos Ativos
        </div>
        <span className="chat-section-sub">
          <span className="chat-live-pulse" />
          tempo real
        </span>
      </div>
      <div className="conflict-cards-grid">
        {ACTIVE_CONFLICTS.map(c => (
          <button
            key={c.id}
            className="conflict-card"
            onClick={() => onAsk(c.query)}
            title={`Perguntar sobre ${c.name}`}
          >
            <span className="conflict-card-accent-bar" style={{ background: c.color }} />

            {/* Topo: região + dot de severidade */}
            <div className="conflict-card-top">
              <div className="conflict-card-region">{c.region}</div>
              <div className="conflict-card-sev-dot" style={{ background: c.color }} />
            </div>

            {/* Nome do conflito */}
            <div className="conflict-card-name">{c.name}</div>

            {/* Sparkline maior */}
            <div className="conflict-card-spark">
              <SparklineSVG data={c.sparkData} color={c.color} height={44} />
            </div>

            {/* Rodapé: badge + arrow */}
            <div className="conflict-card-footer">
              <span className={badgeClass(c.risk)}>
                {c.trend === 'up' ? '↑ ' : c.trend === 'down' ? '↓ ' : '→ '}
                {c.risk}
              </span>
              <span className="conflict-card-arrow">↗</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTE — Cards de Mercado (AUMENTADOS + navegação individual)
// =============================================================================
function MarketCards({
  onNavigate,
  onAskInChat,
}: {
  onNavigate?: () => void
  onAskInChat?: (q: string) => void
}) {
  const dc = (d: 'up'|'down'|'flat') =>
    d === 'up' ? '#22c55e' : d === 'down' ? '#ef4444' : '#6b7280'
  const da = (d: 'up'|'down'|'flat') =>
    d === 'up' ? '▲' : d === 'down' ? '▼' : '—'

  return (
    <div className="chat-section">
      <div className="chat-section-header">
        <div className="chat-section-title">
          <span className="chat-section-accent chat-section-accent-amber" />
          Economia & Mercados
        </div>
        {onNavigate && (
          <button className="chat-section-link" onClick={onNavigate}>
            Ver painel completo →
          </button>
        )}
      </div>

      <div className="market-cards-grid">
        {MARKET_SNAPSHOT.map(m => (
          <div
            key={m.id}
            className="market-mini-card market-mini-card--clickable"
            onClick={() => onNavigate?.()}
            title="Abrir painel de mercados"
          >
            {/* Topo */}
            <div className="market-mini-header">
              <div className="market-mini-cat">{m.cat}</div>
              <div className="market-mini-dir-dot" style={{ background: dc(m.dir) }} />
            </div>

            {/* Nome */}
            <div className="market-mini-name">{m.name}</div>

            {/* Valor + variação */}
            <div className="market-mini-value">{m.value}</div>
            <div className="market-mini-change" style={{ color: dc(m.dir) }}>
              {da(m.dir)} {m.change}
            </div>

            {/* Rodapé: analisar no chat */}
            <div className="market-mini-footer">
              <button
                className="market-mini-ask"
                onClick={e => { e.stopPropagation(); onAskInChat?.(m.query) }}
                title="Analisar no chat"
              >
                Analisar ↗
              </button>
              <span className="market-mini-goto" onClick={e => { e.stopPropagation(); onNavigate?.() }}>
                Ver gráfico →
              </span>
            </div>
          </div>
        ))}
      </div>

      {onNavigate && (
        <button className="market-full-btn" onClick={onNavigate}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 1H2a1 1 0 00-1 1v9a1 1 0 001 1h3v3l4-3h5a1 1 0 001-1V2a1 1 0 00-1-1z"/>
          </svg>
          Abrir painel completo de mercados com gráficos ao vivo
        </button>
      )}
    </div>
  )
}

// =============================================================================
// COMPONENTE PRINCIPAL — ChatTab
// =============================================================================
export default function ChatTab({
  convId, initialMessages, onFirstMessage, onMessagesChange,
  pendingQuestion, onPendingQuestionConsumed, onNavigateToNews,
}: ChatTabProps) {
  const [messages, setMessages]         = useState<ChatMessage[]>(initialMessages)
  const [input, setInput]               = useState('')
  const [isStreaming, setIsStreaming]   = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)

  const abortRef       = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const isFirstMsg     = useRef(true)

  useEffect(() => {
    setMessages(initialMessages)
    setInput('')
    setAttachedFile(null)
    isFirstMsg.current = initialMessages.length === 0
  }, [convId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  useEffect(() => {
    onMessagesChange(convId, messages)
  }, [messages])

  const handleSpeechResult = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text)
  }, [])

  const { listening, isSupported, startListening, stopListening } =
    useSpeechRecognition(handleSpeechResult)

  const toggleMic = () => { listening ? stopListening() : startListening() }

  const sendMessage = async (text?: string) => {
    const question = text || input.trim()
    if (!question || isStreaming) return

    if (isFirstMsg.current) {
      onFirstMessage(convId, question)
      isFirstMsg.current = false
    }

    const userContent = attachedFile
      ? `${question}\n\n📎 *Arquivo anexado: ${attachedFile.name}*`
      : question

    setMessages(prev => [...prev, { role:'user', content:userContent }])
    setInput('')
    setAttachedFile(null)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller
    let assistantContent = ''
    setMessages(prev => [...prev, { role:'assistant', content:'' }])

    try {
      const generator = chatStream(question, controller.signal)
      for await (const chunk of generator) {
        assistantContent += chunk
        setMessages(prev => {
          const updated = [...prev]
          const last    = updated[updated.length - 1]
          if (last.role === 'assistant') last.content = assistantContent
          return updated
        })
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        assistantContent += `\n\n**Erro:** Não foi possível conectar ao servidor.`
        setMessages(prev => {
          const updated = [...prev]
          const last    = updated[updated.length - 1]
          if (last.role === 'assistant') last.content = assistantContent
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (!pendingQuestion?.trim()) return
    const q = pendingQuestion.trim()
    onPendingQuestionConsumed?.()
    void sendMessageRef.current(q)
  }, [pendingQuestion, onPendingQuestionConsumed])

  const stopStreaming = () => { abortRef.current?.abort(); setIsStreaming(false) }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setAttachedFile(file)
    e.target.value = ''
  }

  const hasMessages = messages.length > 0

  return (
    <div className="chat-container">
      {!hasMessages ? (
        <div className="chat-empty">
          <AlertTicker />

          

          <ConflictRiskCards onAsk={q => sendMessage(q)} />

          <MarketCards
            onNavigate={onNavigateToNews}
            onAskInChat={q => sendMessage(q)}
          />
        </div>
      ) : (
        <div className="messages-list">
          {messages.map((msg, i) => (
            <div key={i} className={`message-wrapper message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
              {msg.role === 'user' ? (
                <div><div className="message-bubble">{msg.content}</div></div>
              ) : (
                <>
                  <div className="avatar">🌍</div>
                  <div className="message-bubble">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          {isStreaming && (
            <div className="streaming-indicator">
              <div className="typing-dots"><span /><span /><span /></div>
              <span>Analisando fontes e gerando resposta...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={`chat-input-area ${!hasMessages ? 'empty-state-input' : ''}`}>
        {attachedFile && (
          <div className="file-preview">
            <span>📎</span>
            <span className="file-preview-name">{attachedFile.name}</span>
            <button className="file-preview-remove" onClick={() => setAttachedFile(null)}>✕</button>
          </div>
        )}
        <div className="input-wrapper">
          <input
            type="text" className="chat-input"
            placeholder={
              listening ? 'Ouvindo...' :
              hasMessages ? 'Pergunte sobre geopolítica...' :
              'Analise uma região ou pergunte sobre impactos econômicos e militares...'
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            disabled={isStreaming}
          />
          <button className="input-button attach" onClick={() => fileInputRef.current?.click()} disabled={isStreaming} title="Anexar arquivo">
            <AttachIcon />
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" style={{ display:'none' }} onChange={handleFileChange} />
          {isSupported && (
            <button className={`input-button mic ${listening ? 'listening' : ''}`} onClick={toggleMic} disabled={isStreaming} title={listening ? 'Parar' : 'Falar'}>
              <MicIcon />
            </button>
          )}
          {isStreaming ? (
            <button className="input-button stop" onClick={stopStreaming}><StopIcon /></button>
          ) : (
            <button className="input-button send" onClick={() => sendMessage()} disabled={!input.trim() && !attachedFile}><SendIcon /></button>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ÍCONES
// =============================================================================
function SendIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/></svg>
}
function StopIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
}
function MicIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
}
function AttachIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
}