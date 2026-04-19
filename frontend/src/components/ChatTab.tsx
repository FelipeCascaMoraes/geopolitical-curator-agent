import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatStream } from '../api'
import { ChatMessage } from '../types'

// =============================================================================
// TIPOS E PROPS
// convId          — ID da conversa atual (muda quando o usuário troca de conversa)
// initialMessages — mensagens já salvas para essa conversa
// onFirstMessage  — callback para nomear a conversa na primeira pergunta
// onMessagesChange— callback para sincronizar mensagens de volta ao App
// =============================================================================

interface ChatTabProps {
  convId:           string
  initialMessages:  ChatMessage[]
  onFirstMessage:   (convId: string, question: string) => void
  onMessagesChange: (convId: string, messages: ChatMessage[]) => void
}

const SUGGESTIONS = [
  { icon: '⚔️', text: 'O que está acontecendo na guerra da Ucrânia?',   query: 'guerra Russia Ucrania' },
  { icon: '🕊️', text: 'Quais conflitos estão ativos no Oriente Médio?', query: 'conflitos Oriente Medio Israel Palestina' },
  { icon: '🛢️', text: 'Como a tensão em Taiwan afeta o mercado?',        query: 'tensao Taiwan China mercado semicondutores' },
  { icon: '💵', text: 'Impacto das sanções na economia mundial?',        query: 'sanções economicas Russia impacto global' },
  { icon: '🌎', text: 'Situação da América Latina geopolítica',          query: 'America Latina geopolítica conflitos' },
  { icon: '🇧🇷', text: 'Como os conflitos afetam o Brasil?',             query: 'impacto conflitos geopoliticos Brasil economia' },
]

// =============================================================================
// SPEECH-TO-TEXT
// Usa a Web Speech API nativa do browser — sem custo, sem dependência.
// Funciona no Chrome e Edge. No Firefox pode precisar de flag.
// =============================================================================

// Declara o tipo da API pois o TypeScript não a inclui por padrão
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

function useSpeechRecognition(onResult: (text: string) => void) {
  const recognitionRef = useRef<any>(null)
  const [listening, setListening] = useState(false)

  // Verifica se o browser suporta
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang           = 'pt-BR'  // reconhece português do Brasil
    rec.interimResults = false     // só retorna resultado final
    rec.maxAlternatives = 1

    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = () => setListening(false)
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      onResult(transcript)
    }

    recognitionRef.current = rec
    rec.start()
  }, [isSupported, onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, isSupported, startListening, stopListening }
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function ChatTab({
  convId, initialMessages, onFirstMessage, onMessagesChange,
}: ChatTabProps) {
  const [messages, setMessages]       = useState<ChatMessage[]>(initialMessages)
  const [input, setInput]             = useState('')
  const [isStreaming, setIsStreaming]  = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)

  const abortRef       = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const isFirstMsg     = useRef(true)  // controla se é a primeira mensagem da conversa

  // Quando a conversa muda (usuário clicou em outra na sidebar),
  // reseta tudo para o estado inicial daquela conversa
  useEffect(() => {
    setMessages(initialMessages)
    setInput('')
    setAttachedFile(null)
    isFirstMsg.current = initialMessages.length === 0
  }, [convId])

  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sincroniza mensagens de volta ao App sempre que mudam
  useEffect(() => {
    onMessagesChange(convId, messages)
  }, [messages])

  // =============================================================================
  // SPEECH-TO-TEXT
  // Quando o usuário para de falar, o texto vai direto para o input
  // =============================================================================
  const handleSpeechResult = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text)
  }, [])

  const { listening, isSupported, startListening, stopListening } =
    useSpeechRecognition(handleSpeechResult)

  const toggleMic = () => {
    if (listening) stopListening()
    else startListening()
  }

  // =============================================================================
  // ENVIO DE MENSAGEM
  // =============================================================================
  const sendMessage = async (text?: string) => {
    const question = text || input.trim()
    if (!question || isStreaming) return

    // Nomeia a conversa na primeira mensagem
    if (isFirstMsg.current) {
      onFirstMessage(convId, question)
      isFirstMsg.current = false
    }

    // Monta o conteúdo da mensagem — texto + nome do arquivo se houver
    const userContent = attachedFile
      ? `${question}\n\n📎 *Arquivo anexado: ${attachedFile.name}*`
      : question

    setMessages(prev => [...prev, { role: 'user', content: userContent }])
    setInput('')
    setAttachedFile(null)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    let assistantContent = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

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

  const stopStreaming = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  // =============================================================================
  // ANEXAR ARQUIVO
  // Por enquanto mostra o nome do arquivo na mensagem.
  // Para enviar o conteúdo ao agente, precisaria de leitura no backend.
  // =============================================================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setAttachedFile(file)
    // Reseta o input para permitir selecionar o mesmo arquivo de novo
    e.target.value = ''
  }

  const hasMessages = messages.length > 0

  return (
    <div className="chat-container">

      {/* Tela vazia com sugestões */}
      {!hasMessages ? (
        <div className="chat-empty">
          <span className="chat-empty-globe">🌍</span>
          <h2>O que você quer saber sobre o cenário geopolítico?</h2>
          <p>Pergunte sobre conflitos, tensões internacionais, impactos econômicos e muito mais.</p>
          <div className="suggestions-grid">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="suggestion-card"
                onClick={() => sendMessage(s.query)}
                disabled={isStreaming}
              >
                <span className="suggestion-icon">{s.icon}</span>
                <span className="suggestion-text">{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Lista de mensagens */
        <div className="messages-list">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`message-wrapper message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}
            >
              {msg.role === 'user' ? (
                <div>
                  <div className="message-bubble">{msg.content}</div>
                </div>
              ) : (
                <>
                  <div className="avatar">🌍</div>
                  <div className="message-bubble">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
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

      {/* Área de input */}
      <div className={`chat-input-area ${!hasMessages ? 'empty-state-input' : ''}`}>

        {/* Preview do arquivo anexado */}
        {attachedFile && (
          <div className="file-preview">
            <span>📎</span>
            <span className="file-preview-name">{attachedFile.name}</span>
            <button
              className="file-preview-remove"
              onClick={() => setAttachedFile(null)}
            >✕</button>
          </div>
        )}

        <div className="input-wrapper">
          {/* Input de texto */}
          <input
            type="text"
            className="chat-input"
            placeholder={listening ? 'Ouvindo...' : hasMessages ? 'Pergunte sobre geopolítica...' : 'Faça uma pergunta...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            disabled={isStreaming}
          />

          {/* Botão anexar arquivo */}
          <button
            className="input-button attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title="Anexar arquivo"
          >
            <AttachIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Botão microfone — só mostra se o browser suporta */}
          {isSupported && (
            <button
              className={`input-button mic ${listening ? 'listening' : ''}`}
              onClick={toggleMic}
              disabled={isStreaming}
              title={listening ? 'Parar gravação' : 'Falar'}
            >
              <MicIcon />
            </button>
          )}

          {/* Botão enviar / parar */}
          {isStreaming ? (
            <button className="input-button stop" onClick={stopStreaming}>
              <StopIcon />
            </button>
          ) : (
            <button
              className="input-button send"
              onClick={() => sendMessage()}
              disabled={!input.trim() && !attachedFile}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ÍCONES SVG inline — sem dependência de biblioteca de ícones
// =============================================================================

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m22 2-7 20-4-9-9-4Z"/>
      <path d="m22 2-11 11"/>
    </svg>
  )
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
      viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
  )
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  )
}

function AttachIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}