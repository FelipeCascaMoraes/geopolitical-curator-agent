# 🌐 Geopolitical Curator Agent

> Projeto de aprendizado — IA especializada em geopolítica mundial, conflitos, diplomacia e economia global em tempo real.

---

## Sobre o Projeto

O **Geopolitical Curator Agent** é um agente de inteligência artificial focado em geopolítica mundial. Ele monitora, curadoria e analisa os principais acontecimentos globais — conflitos armados, movimentos diplomáticos, crises econômicas, principais mercados financeiro, os 6 continentes e impactos humanitários — entregando tudo isso de forma conversacional e acessível.

O projeto nasceu como um **objetivo de aprendizado**, explorando na prática como construir agentes de IA com ferramentas modernas. A inspiração veio de um projeto do curso da **Asimov Academy**, adaptado e expandido com novas funcionalidades.

---

## Funcionalidades

- **Feed de Notícias** — curadoria automática de notícias geopolíticas em tempo real, com filtros por categoria (conflitos, diplomacia, economia, América Latina)
- **Chat com IA** — converse diretamente com o agente para análises aprofundadas, contexto histórico e perspectivas sobre qualquer evento global
- **Interface moderna** — frontend responsivo com tema dark, construído em React + TypeScript

---

## Tecnologias

### Backend
- Python
- Groq API
- Pipeline multi-agente (curador, analisador, resumidor)

### Frontend
- React + TypeScript
- Vite
- CSS customizado com tema dark geopolítico

---

## Estrutura do Projeto

```
geopolitical-curator-agent/
├── raiz/          # Backend: agentes, pipeline e API
├── frontend/      # Interface React
├── .gitignore
└── requirements.txt
```

---

## Como Rodar

### Backend

```bash
# Instale as dependências
pip install -r requirements.txt

# Configure sua chave da API Groq
export GROQ_API_KEY=sua_chave_aqui

# Rode o backend
cd raiz
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173` no navegador.

---

## Inspiração e Ferramentas

Este projeto foi desenvolvido com fins de aprendizado, inspirado no projeto do curso da [Asimov Academy](https://asimov.academy/).

Durante o desenvolvimento, usei:
- **Claude (claude.ai)** — para auxiliar na arquitetura, código e design da interface
- **Claude Code** — para implementação assistida diretamente no terminal

---

## Aprendizados

- Construção de pipelines multi-agente com LLMs
- Integração de APIs de IA em aplicações React
- Design de interfaces conversacionais
- Organização de projetos fullstack com Python + TypeScript
- Frontend
---

## Autor

**Felipe Casca Moraes**  
[GitHub](https://github.com/FelipeCascaMoraes)

---

> *"Entender o mundo é o primeiro passo para agir nele."*
