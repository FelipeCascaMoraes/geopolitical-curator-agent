# =============================================================================
# main.py — Entrypoint CLI do Geopolitical Curator Agent
# =============================================================================
#
# O main.py faz toda a parte do input com o usuário
#
# Como usar:
#
#   # Modo interativo
#   python main.py
#
#   # Passando o tema direto
#   python main.py "o que está acontecendo na guerra da Ucrânia?"
#
# =============================================================================

import sys
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from agent import geopolitical_workflow

console = Console()


def exibir_banner():
    texto = Text()
    texto.append("  Geopolitical Curator Agent\n", style="bold white")
    texto.append("  Curadoria inteligente de conflitos e eventos geopolíticos\n", style="dim white")
    texto.append("\n")
    texto.append("  Stack: ", style="dim")
    texto.append("Agno • Groq LLaMA • NewsData.io • GDELT", style="cyan")

    console.print(Panel(texto, border_style="blue", padding=(1, 2)))


PALAVRAS_COMPLETO = ["mais detalhes", "explica", "aprofunda", "completo", "relatório", "relatorio"]

ultimo_tema = ""

def executar(pergunta: str):
    global ultimo_tema

    modo = "COMPLETO" if any(p in pergunta.lower() for p in PALAVRAS_COMPLETO) else "RESUMO"

    if modo == "COMPLETO" and ultimo_tema:
        pergunta_final = f"COMPLETO: {ultimo_tema}"
    else:
        pergunta_final = f"{modo}: {pergunta}"
        ultimo_tema = pergunta

    console.print(f"\n[bold blue]Analisando:[/bold blue] [white]{pergunta}[/white]")
    console.print(f"[dim]Modo: {modo} — Isso pode levar alguns minutos...[/dim]\n")

    try:
        geopolitical_workflow.print_response(
            pergunta_final,
            stream=True,
            markdown=True,
        )
        console.print("\n[bold green]✓ Análise concluída![/bold green]\n")

    except KeyboardInterrupt:
        console.print("\n[yellow]Interrompido pelo usuário.[/yellow]\n")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n[bold red]Erro:[/bold red] {e}\n")
        sys.exit(1)

def modo_interativo():
    console.print("\n[dim]Pergunte qualquer coisa sobre o cenário geopolítico atual.[/dim]")
    console.print("[dim]Ex: o que está acontecendo na guerra da Ucrânia?[/dim]")
    console.print("[dim]Ex: quais conflitos estão ativos no Oriente Médio?[/dim]")
    console.print("[dim]Ex: como a tensão em Taiwan afeta o mercado?[/dim]\n")

    while True:
        try:
            pergunta = console.input(
                "[bold cyan]Sua pergunta[/bold cyan] [dim](ou 'sair')[/dim]: "
            ).strip()

            if not pergunta:
                console.print("[yellow]Digite uma pergunta.[/yellow]")
                continue

            if pergunta.lower() in ("sair", "exit", "quit", "q"):
                console.print("\n[dim]Encerrando...[/dim]\n")
                break

            executar(pergunta)

        except KeyboardInterrupt:
            console.print("\n[dim]Encerrando...[/dim]\n")
            break


if __name__ == "__main__":
    exibir_banner()

    if len(sys.argv) > 1:
        pergunta = " ".join(sys.argv[1:])
        executar(pergunta)
    else:
        modo_interativo()