import fs from 'fs'
import path from 'path'

export default {
    name: 'dir',
    alias: ['carpetas', 'ls', 'list'],
    description: 'Muestra las carpetas y archivos del primer piso',
    category: 'owner',
    command: ['dir', 'carpetas'],

    async execute(m, { conn, args, usedPrefix }) {

        const from = m.chat

        try {

            // Ruta por defecto: raíz del bot
            const ruta = args[0] || './'

            // Leer contenido
            const items = fs.readdirSync(ruta)

            if (items.length === 0) {

                return await conn.sendMessage(
                    from,
                    {
                        text: `📂 La carpeta \`${ruta}\` está vacía`
                    },
                    {
                        quoted: m
                    }
                )
            }

            let lista =
                `📁 *Contenido de:* \`${ruta}\`\n\n`

            for (const item of items) {

                const fullPath =
                    path.join(ruta, item)

                try {

                    const stats =
                        fs.statSync(fullPath)

                    if (stats.isDirectory()) {

                        lista += `📁 *${item}*/\n`

                    } else {

                        lista += `📄 ${item}\n`
                    }

                } catch {

                    lista += `❓ ${item}\n`
                }
            }

            lista +=
                `\n💡 *Uso:* ${usedPrefix}dir [ruta]` +
                `\n*Ejemplo:* ${usedPrefix}dir lib`

            await conn.sendMessage(
                from,
                {
                    text: lista
                },
                {
                    quoted: m
                }
            )

        } catch (error) {

            await conn.sendMessage(
                from,
                {
                    text:
                        `❌ *Error:* ${error?.message || error}` +
                        `\n\nAsegú
