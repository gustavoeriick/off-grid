# Projeto de backup de energia off-grid

Objetivo: manter a casa funcionando em quedas de luz, não abater conta de energia. Sistema em 24 V, começando com uma placa e uma bateria, preparado para crescer até três placas e três baterias.

## Cargas a sustentar

- Nobreak de 300 W: modem, roteador e mini PC (\~40 W)
- Nobreak de 1200: PC ligado 24/7 (\~60 a 80 W) e PC de trabalho com RX 580 (\~120 a 150 W, desligado à noite)
- Geladeira (\~90 W em média, pico de partida alto)
- Ventilador (\~50 W)
- TV (\~80 W)

Consumo médio estimado: 450 a 500 W de dia com tudo ligado, 300 W à noite.

## Autonomia estimada

- 1 bateria 24 V 100 Ah LiFePO4 (\~2,2 kWh úteis): \~4,5 h de dia, \~7 h à noite
- 2 baterias (\~4,4 kWh): \~9 h de dia, \~14 h à noite
- 3 baterias (\~6,6 kWh): \~13 h de dia, \~22 h à noite

Para comparação, uma estacionária de chumbo 12 V 220 Ah entrega só \~1,1 kWh úteis (50% de descarga), ou seja, 2,5 h de dia e 4 h à noite.

## Comparativo das fases: o que muda na prática

| Configuração | Energia útil | Autonomia de dia (450–500 W) | Autonomia à noite (300 W) | Recarga solar por dia | Custo acumulado | Diferença para a fase anterior | Na prática |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 placa + 1 bateria | 2,2 kWh | \~4,5 h | \~7 h | \~1,8 kWh (recarrega em \~1 dia de sol) | R$ 4.600 a 7.700 | — | Segura uma queda curta: tarde inteira de trabalho ou uma noite quase completa |
| 2 placas + 2 baterias | 4,4 kWh | \~9 h | \~14 h | \~3,6 kWh (recarrega em \~1 dia de sol) | R$ 6.900 a 11.900 | + R$ 2.300 a 4.200 | Segura uma noite inteira com sobra, ou um dia útil completo de trabalho |
| 3 placas + 3 baterias | 6,6 kWh | \~13 h | \~22 h | \~5,5 kWh (recarrega em \~1 dia de sol) | R$ 9.200 a 16.100 | + R$ 2.300 a 4.200 | Segura um dia inteiro sem luz; com sol, vira praticamente ilimitado para essas cargas |

Valores aproximados, com base nos preços de nov/2026: bateria 24 V 100 Ah entre R$ 1.800 e 3.500, placa de 550 W entre R$ 500 e 700. O inversor e a instalação são pagos uma vez só na fase 1.

## Equipamentos

### Fase 1 (compra inicial)

- 1 bateria LiFePO4 24 V 100 Ah com BMS (escolher modelo que permita paralelo; anotar marca e modelo para repetir depois)
- 1 placa solar de 550 W
- Inversor híbrido off-grid 24 V, 2 a 3 kW, senoidal puro, com carregador pela rede e MPPT de 60 A integrado (aceita até \~1.600 W de painel)
- Cabos, disjuntores CC e CA, fusível da bateria, estrutura da placa, já dimensionados para a configuração final

### Fase 2 e 3 (upgrades)

- Segunda e terceira bateria 24 V 100 Ah, mesmo modelo, em paralelo
- Segunda e terceira placa de 550 W, mesmo modelo, em paralelo ou série conforme a faixa de tensão do MPPT

## Recarga solar

Rio de Janeiro: \~4,5 h de sol pleno por dia. Uma placa de 550 W repõe \~1,8 kWh/dia descontando perdas, ou seja, recarrega uma bateria em pouco mais de um dia de sol. Três placas repõem \~5,5 kWh/dia.

## Orçamento estimado (nov/2026)

### Fase 1

- Bateria 24 V 100 Ah: R$ 1.800 a 3.500 (a Felicity Solar 12 V 100 Ah estava em R$ 1.711; LiTime é referência de marca)
- Placa 550 W: R$ 500 a 700
- Inversor híbrido 24 V 2 a 3 kW com MPPT 60 A: R$ 1.800 a 3.000
- Cabos, proteções e estrutura: \~R$ 500
- Total fase 1: R$ 4.600 a 7.700

### Cada upgrade

- Mais uma bateria: R$ 1.800 a 3.500
- Mais uma placa: R$ 500 a 700

## Pontos de atenção

- Não começar com uma única bateria de 12 V em sistema 24 V; usar bateria de 24 V desde o início
- Inversor precisa ser senoidal puro e aguentar o pico de partida do compressor da geladeira
- Verificar a tensão máxima de entrada do MPPT antes de ligar placas em série
- Baterias em paralelo devem ser do mesmo modelo e idade
- Instalar fusível ou disjuntor CC junto à bateria e aterrar o sistema

## Instalação (feita por conta própria)

A rede do off-grid fica totalmente separada da rede da casa: nada passa pelo quadro de distribuição. Do inversor saem tomadas dedicadas para pontos estratégicos; na queda de luz, basta trocar o aparelho de tomada. Isso elimina o risco de retorno de energia para a rede e dispensa chave de transferência.

### Lado CC (bateria, placas, inversor)

1. Fixar o inversor em parede ventilada, perto da bateria, para cabos CC curtos (até 1 m se possível).
2. Bateria ao inversor: cabo de 25 mm² para 24 V e até 3 kW, com fusível ou disjuntor CC de 150 A junto ao polo positivo da bateria.
3. Placas ao inversor: cabo solar de 4 ou 6 mm², conectores MC4, disjuntor CC ou chave seccionadora entre as placas e a entrada MPPT.
4. Conferir polaridade com multímetro antes de cada conexão; ligar primeiro a bateria, depois as placas, depois a saída CA.
5. Aterrar a carcaça do inversor e a estrutura das placas.
6. Ao expandir: baterias novas em paralelo, mesmo modelo, equalizadas na mesma tensão antes de conectar; placas conforme a faixa de tensão do MPPT.

### Lado CA (tomadas dedicadas)

1. Da saída do inversor, circuito próprio com disjuntor CA de 16 A e cabo de 2,5 mm².
2. Levar tomadas dedicadas a: escritório (nobreak de 1200), modem/roteador/mini PC (nobreak de 300), geladeira, ventilador e TV.
3. Geladeira: extensão a mais curta possível, cabo de 2,5 mm², para não ter queda de tensão no pico de partida do compressor.
4. Identificar as tomadas do off-grid com cor diferente, para ninguém ligar chuveiro, micro-ondas ou ferro nelas.

### Operação no dia a dia

- Os dois nobreaks ficam permanentemente nas tomadas do off-grid. O inversor híbrido fica no modo que prioriza a rede e passa para a bateria automaticamente na queda; PCs e roteador nem percebem.
- Na queda de luz, trocar manualmente de tomada só geladeira, ventilador e TV.
- Com a rede presente, o inversor mantém a bateria carregada pela rede e pelas placas.

### Materiais de instalação

- Cabo 25 mm² (bateria), cabo solar 4 ou 6 mm², cabo 2,5 mm² (CA)
- Fusível ou disjuntor CC 150 A, disjuntor CC para as placas, disjuntor CA 16 A
- Conectores MC4, terminais de olhal, caixa de passagem
- Tomadas de cor diferenciada, haste de aterramento
- Estrutura de fixação das placas
- Multímetro para conferência
