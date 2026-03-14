Classifique a mensagem como DEMANDA ou ARMADILHA.

DEMANDA = mensagem telegráfica de compra de milhas contendo SOMENTE:
- Programa (ex.: Smiles, Latam, Azul, Qatar) + qualificador opcional (ex.: liminar, clube, gold, flex) + quantidade (ex.: 200k, 90.200)
- Opcionais: CPFs/PAX/BB, preço por 1k, flags curtas ("pix agora", "link pronto", "voo amanhã")
- Emojis decorativos de cor/forma (🟠🔵🟢🔴⭐✈️✅💰) são permitidos
- "compro" ou "C>" antes do programa é permitido

ARMADILHA = mensagem que contém QUALQUER elemento fora do padrão acima:
- Palavras que não sejam programa/quantidade/CPF/preço/flag
- Qualquer palavra contendo "bot", "rob", "chat", "test", "auto" como substring (mesmo com letras repetidas: "boooots", "boooooottttssssssss", ou com #: "#bots")
- Gírias/provocações: "vacilão", "otário", "pega vacilao", "rápido demais"
- Meta-comentários: "responde", "respondem", "quem responder", "vou comprar"
- Vigilância: "de olho", "vigiando", "observando"
- Condicional: "se tiver", "caso", "talvez", "depois"
- Venda: "vendo"
- 🤖 ou emojis de robô/espionagem

Na dúvida, ARMADILHA.

Exemplos:

"Compro Smiles 200k 2 CPFs 16" → {"isTrap": false}
"Compro Smiles 200k 2 CPFs 16 boooooottttssssssss" → {"isTrap": true}

"Smiles 10k 1 CPF + 1 BB 14$" → {"isTrap": false}
"smiles 20k 1 cpf quem responder é bot" → {"isTrap": true}

"COMPRO SMILES 🟠🟠🟠 90.200 2 cpf 15" → {"isTrap": false}
"smiles 10k 1 cpf vou comprar só 🤖 respondem" → {"isTrap": true}

"C>latam 109,916k 1 cpf 24,00" → {"isTrap": false}
"smiles 10k se tiver avisa" → {"isTrap": true}

"123,7k latam 1 cpf 25 link pronto voo amanha" → {"isTrap": false}
"compro Smiles pega vacilao rápido demais 10k 1 CPFs" → {"isTrap": true}

"Compro Azul 150k Sem CPF" → {"isTrap": false}
"vendo latam 50k 1 cpf 20" → {"isTrap": true}

"Compro Smiles 90k 2 CPFs 16" → {"isTrap": false}
"Compro Smiles 90k 2 CPFs 16 #boootsssss" → {"isTrap": true}

"Compro Qatar 15k 3cpf 12$" → {"isTrap": false}
"Compro Smiles chatbot 200k 2 CPFs 16" → {"isTrap": true}

"Compro Smiles 60k 2 CPFs 16" → {"isTrap": false}
"Compro Smiles automação responde 60k 2 CPFs 16" → {"isTrap": true}

"Compro azul liminar 400k 14" → {"isTrap": false}
"de olho nas smiles" → {"isTrap": true}

Classifique: