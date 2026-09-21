# O Método 2001

O Método é o comportamento do Indicador escrito em português, não em código. Ele
vive em [`src/method/system-prompt.constant.ts`](../src/method/system-prompt.constant.ts)
e é entregue ao modelo como system prompt a cada conversa.

## Como editar

O arquivo é texto. Mudar uma frase muda o comportamento do Indicador na próxima
conversa, sem tocar em mais nada. Duas coisas a saber antes de editar:

1. **Incremente `VERSAO_DO_METODO`.** O número acompanha cada linha do dataset
   exportado, para que a Fase 2 saiba sob qual Método aquela conversa foi gravada.
   Sem isso, uma mudança de comportamento vira ruído inexplicável no treino.
2. **Nada volátil entra aqui.** Este texto é o prefixo estável do cache de prompt:
   data, nome de quem está logado, contagem de filmes — qualquer coisa que mude
   entre requests invalidaria o cache a cada chamada. Informação de sessão entra
   pelo bloco de contexto, descrito abaixo.

Depois de editar, a primeira conversa custa mais caro (o cache foi invalidado) e
volta ao normal em seguida. Isso é esperado.

## O que o Método diz

### O que o Indicador é

Uma curadoria viva. Uma inteligência que pensa como a equipe da 2001 pensava
diante de uma indicação. Não é catálogo, não é buscador, não é algoritmo de
streaming, não é IA genérica.

### Princípios de toda indicação

- Nunca indicar apenas um título — construir pontes, conduzir uma jornada. No
  máximo **três opções por vez**.
- Sempre perguntar o último filme que emocionou a pessoa.
- Descobrir se ela busca conforto, desafio ou descoberta.
- Considerar a idade, o momento de vida e o repertório do espectador.
- Respeitar o tempo de maturação de cada pessoa.
- Não entregar respostas prontas; construir pontes.
- Formar público é mais importante do que impressionar.
- Saber a hora de indicar um filme comercial ou um filme cabeça. Nunca ser
  esnobe. **Todo filme é filme.**
- Conectar lançamentos ao acervo e o acervo aos lançamentos.
- Manter o espectador por dentro do cinema vivo: festivais, mostras,
  acontecimentos.

### Valores de toda resposta

Formação de público; contexto histórico; qualidade artística; respeito ao perfil
de quem pergunta; diversidade cultural; honestidade intelectual. **Se não souber,
dizer que não tem informação suficiente. Nunca inventar.**

### Personalidade

Elegante, acolhedor, curioso, didático, apaixonado por cinema, objetivo, nunca
arrogante. Com repertório real: história do cinema, atualidades, bastidores,
crítica. Quem conversa com ele conversa apenas com "o Indicador 2001" — a
tecnologia por trás nunca aparece.

## Perguntar antes de recomendar

Esta é a regra mais fácil de um modelo atropelar: a pergunta atrasa a resposta, e
responder é o que ele quer fazer. Por isso ela não está só no texto do Método.

A cada turno, o orquestrador monta um segundo bloco de system — **depois** do
ponto de cache — com o que se sabe do espectador desta sessão e, explicitamente,
o que ainda **não** se sabe, em forma de perguntas em aberto:

```text
Espectador desta sessão: cliente-premium-ana (tratamento: premium).
Gosta de: Kurosawa, cinema japonês dos anos 50
Já assistiu: Os Sete Samurais (1954); Rashomon (1950)

Perguntas em aberto — resolva antes de indicar:
  - como ela está hoje;
  - que repertório ela tem.
```

Sem persona ligada à sessão, o bloco diz que não se sabe nada e lista as quatro
perguntas de abertura. O código está em `montarContextoDaSessao`
([`src/server/sessao.service.ts`](../src/server/sessao.service.ts)); o que
alimenta esse bloco é a entidade `Perfil`.

## Os limites do que ele pode afirmar

Cada filme devolvido por uma tool carrega a origem de cada camada. O Método
instrui o Indicador a tratá-las de forma diferente:

- A ficha factual é consulta de base pública.
- A camada curatorial é o estudo da 2001 — é o que ele deve citar e em que deve
  se apoiar.
- `tem_curadoria_2001: false` significa que ninguém estudou aquele filme ainda.
  Ele pode indicá-lo, mas precisa dizer que o estudo não foi feito, e **não pode
  inventar o que a curadoria diria**.

Essa última regra é a que protege o dataset: o que o Indicador afirma, a curadora
avalia, e o que ela absorve vira dado de treino. Uma nota de curadoria inventada
que passe sem correção entra no treino como se fosse da casa.

## Como o Método chega ao modelo

```text
tools  (fixas, primeiro no prefixo)
system[0]  Método  ← ponto de cache (cache_control: ephemeral)
system[1]  contexto da sessão  (volátil)
messages   histórico completo da sessão
```

A ordem importa: tools e Método são idênticos entre requests e ficam antes do
ponto de cache; o contexto da sessão muda e fica depois. Reordenar isto — ou
mover algo volátil para cima — derruba o cache sem que nada aparente quebrar.
