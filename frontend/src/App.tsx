import { useState, useCallback, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatTab from './components/ChatTab'
import NewsTab from './components/NewsTab'
import { ChatMessage } from './types'

const API_BASE = 'http://localhost:8000'

// =============================================================================
// TIPOS
// Conversation representa uma conversa completa, com título e mensagens.
// O título é gerado automaticamente a partir da primeira pergunta do usuário.
// =============================================================================

export interface Conversation {
  id:        string
  title:     string
  messages:  ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// HELPERS DE PERSISTÊNCIA
// Salva e carrega conversas do localStorage.
// Datas são serializadas como string ISO e precisam ser convertidas de volta.
function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem('geo_conversations', JSON.stringify(convs))
  } catch {}
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem('geo_conversations')
    if (!raw) return []
    return JSON.parse(raw).map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }))
  } catch {
    return []
  }
}

function generateTitle(question: string): string {
  // Pega as primeiras 50 letras da pergunta como título
  return question.length > 50 ? question.slice(0, 50) + '…' : question
}

function newConversation(): Conversation {
  return {
    id:        Date.now().toString(),
    title:     'Nova conversa',
    messages:  [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function App() {
  const [activeTab, setActiveTab]       = useState<'chat' | 'news'>('news')
  const [apiConnected, setApiConnected] = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)

  // Lista de todas as conversas — persistida no localStorage
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = loadConversations()
    // Se não tem nenhuma conversa salva, cria uma vazia pra começar
    return saved.length > 0 ? saved : [newConversation()]
  })

  // ID da conversa atualmente aberta
  const [activeConvId, setActiveConvId] = useState<string>(
    () => conversations[0]?.id ?? ''
  )

  // Conversa ativa derivada do estado — não precisa de useState separado
  const activeConversation = conversations.find(c => c.id === activeConvId) ?? conversations[0]

  // Persiste no localStorage toda vez que conversations muda
  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  // Health check da API a cada 30 segundos
  const checkApi = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/health`)
      setApiConnected(true)
    } catch {
      setApiConnected(false)
    }
  }, [])

  useEffect(() => {
    checkApi()
    const interval = setInterval(checkApi, 30000)
    return () => clearInterval(interval)
  }, [checkApi])

  // =============================================================================
  // AÇÕES DE CONVERSA
  // =============================================================================

  // Cria uma nova conversa e já abre ela
  const handleNewConversation = useCallback(() => {
    const conv = newConversation()
    setConversations(prev => [conv, ...prev])
    setActiveConvId(conv.id)
    setActiveTab('chat')
    setSidebarOpen(false)
  }, [])

  // Seleciona uma conversa existente na sidebar
  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id)
    setActiveTab('chat')
    setSidebarOpen(false)
  }, [])

  // Deleta uma conversa — se era a ativa, abre a próxima ou cria uma nova
  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (next.length === 0) {
        const fresh = newConversation()
        setActiveConvId(fresh.id)
        return [fresh]
      }
      if (id === activeConvId) {
        setActiveConvId(next[0].id)
      }
      return next
    })
  }, [activeConvId])

  // Limpa todo o histórico
  const handleClearAll = useCallback(() => {
    const fresh = newConversation()
    setConversations([fresh])
    setActiveConvId(fresh.id)
  }, [])

  // Chamado pelo ChatTab quando o usuário envia a primeira mensagem da conversa:
  // define o título da conversa automaticamente
  const handleFirstMessage = useCallback((convId: string, question: string) => {
    setConversations(prev => prev.map(c =>
      c.id === convId && c.title === 'Nova conversa'
        ? { ...c, title: generateTitle(question), updatedAt: new Date() }
        : c
    ))
  }, [])

  // Chamado pelo ChatTab para sincronizar as mensagens de volta ao App
  // Precisamos disso para persistir o histórico de mensagens no localStorage
  const handleMessagesChange = useCallback((convId: string, messages: ChatMessage[]) => {
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, messages, updatedAt: new Date() } : c
    ))
  }, [])

  return (
    <div className="app-layout">

      {/* Botão hamburguer — só aparece no mobile */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSidebarOpen(false) }}
        apiConnected={apiConnected}
        conversations={conversations}
        activeConvId={activeConvId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onClearAll={handleClearAll}
      />
      
      <main className="main-content">
        {activeTab === 'chat' ? (
          <ChatTab
            key={activeConvId}
            convId={activeConvId}
            initialMessages={activeConversation?.messages ?? []}
            onFirstMessage={handleFirstMessage}
            onMessagesChange={handleMessagesChange}
          />
        ) : (
          <NewsTab />
        )}
      </main>

    </div>
  )
}