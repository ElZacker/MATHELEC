# Generación de propuestas de circuitos

## Modo demostración

Sin `OPENAI_API_KEY`, `/api/generate` devuelve una propuesta fija para un circuito LED básico o solicita más información. No es un modelo de IA y no simula el circuito.

## Proveedor de IA opcional

1. Copiá `.env.example` a `.env.local`.
2. Configurá `OPENAI_API_KEY` con una clave válida y, opcionalmente, `OPENAI_MODEL`.
3. Reiniciá `npm run dev` después de cambiar las variables de entorno.

La clave se lee únicamente en el servidor. No uses el prefijo `NEXT_PUBLIC_` ni subas `.env.local` a Git. El endpoint limita los pedidos a 2000 caracteres, la respuesta a 12 componentes y 20 conexiones, y valida tipos, índices y terminales contra la biblioteca local.

## Limitaciones

- La biblioteca actual solo admite batería, resistencia, LED, interruptor y tierra.
- Las propuestas son preliminares; el verificador actual es estructural, no una simulación eléctrica.
- Los archivos adjuntos no se leen ni se analizan en esta etapa.
- La configuración real de IA requiere una clave del proveedor y puede generar cargos según la cuenta y el modelo.
