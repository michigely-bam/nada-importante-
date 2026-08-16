import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, args, usedPrefix }) => {
    const from = m.key.remoteJid

    try {
        const ruta = args[0] || './'

        const items = fs.readdirSync(ruta)

        if (items.length === 0) {
            return await conn.sendMessage(
                from,
                {
                    text: `📂 La carpeta \`${ruta}\` está vacía`
                },
                { quoted: m }
            )
        }

        let lista = `📁 *Contenido de:* \`${ruta}\`\n\n`

        for (const item of items) {
            const fullPath = path.join(ruta, item)

            try {
                const stats = fs.statSync(fullPath)

                if (stats.isDirectory()) {
                    lista += `📁 *${item}*/\n`
                } else {
                    lista += `📄 ${item}\n`
                }
            } catch {
                lista += `❓ ${item}\n`
            }
        }

        lista += `\n💡 *Uso:* ${usedPrefix}dir [ruta]`
        lista += `\n*Ejemplo:* ${usedPrefix}dir plugins`

        await conn.sendMessage(
            from,
            {
                text: lista
            },
            { quoted: m }
        )

    } catch (error) {
        await conn.sendMessage(
            from,
            {
                text:
                    `❌ *Error:* ${error?.message || error}` +
                    `\n\nAsegúrate de que la ruta existe.`
            },
            { quoted: m }
        )
    }
}

handler.help = ['dir', 'carpetas', 'ls', 'list']
handler.tags = ['owner']
handler.command = ['dir', 'carpetas', 'ls', 'list']

export default handler
