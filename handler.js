import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsPath = path.join(__dirname, 'plugins')

global.plugins = global.plugins || {}

function getCommandMatch(plugin, command) {
    if (!plugin?.command) return false

    if (plugin.command instanceof RegExp) {
        plugin.command.lastIndex = 0
        const result = plugin.command.test(command)
        plugin.command.lastIndex = 0
        return result
    }

    if (Array.isArray(plugin.command)) {
        return plugin.command.some(cmd =>
            String(cmd).toLowerCase() === command.toLowerCase()
        )
    }

    if (typeof plugin.command === 'string') {
        return plugin.command.toLowerCase() === command.toLowerCase()
    }

    return false
}

async function loadPlugins() {
    if (!fs.existsSync(pluginsPath)) {
        console.log('❌ No existe la carpeta plugins:', pluginsPath)
        return
    }

    const files = fs.readdirSync(pluginsPath)
        .filter(file => file.endsWith('.js'))

    for (const file of files) {
        try {
            const filePath = path.join(pluginsPath, file)
            const url = pathToFileURL(filePath).href

            const module = await import(
                `${url}?update=${Date.now()}`
            )

            if (module.default) {
                global.plugins[file] = module.default

                console.log(`✅ Plugin cargado: ${file}`)
            } else {
                console.log(
                    `⚠️ Plugin sin export default: ${file}`
                )
            }

        } catch (error) {
            console.error(
                `❌ Error cargando ${file}:`,
                error
            )
        }
    }
}

await loadPlugins()

export default async function handler(conn, update) {

    try {

        if (!update?.messages?.length) return

        for (const m of update.messages) {

            try {

                if (!m?.message) continue

                if (
                    m.key?.remoteJid ===
                    'status@broadcast'
                ) continue

                const message =
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    m.message.imageMessage?.caption ||
                    m.message.videoMessage?.caption ||
                    m.message.documentMessage?.caption ||
                    ''

                if (!message) continue

                const prefixMatch =
                    message.match(/^[#!./]/)

                if (!prefixMatch) continue

                const usedPrefix =
                    prefixMatch[0]

                const body =
                    message
                        .slice(usedPrefix.length)
                        .trim()

                if (!body) continue

                const parts =
                    body.split(/\s+/)

                const command =
                    parts
                        .shift()
                        .toLowerCase()

                const text =
                    parts.join(' ')

                console.log(
                    `[CMD] ${usedPrefix}${command}`,
                    text ? `| ${text}` : ''
                )

                for (
                    const [filename, plugin]
                    of Object.entries(global.plugins)
                ) {

                    if (!plugin) continue

                    const matched =
                        getCommandMatch(
                            plugin,
                            command
                        )

                    if (!matched) continue

                    console.log(
                        `🔧 Ejecutando plugin: ${filename}`
                    )

                    const contextInfo =
                        m.message
                            ?.extendedTextMessage
                            ?.contextInfo

                    const quotedMessage =
                        contextInfo?.quotedMessage

                    const ctx = {

                        conn,

                        usedPrefix,

                        command,

                        text,

                        args: text
                            ? text.split(/\s+/)
                            : [],

                        participants: [],

                        isOwner: false,

                        isAdmin: false,

                        isBotAdmin: false,

                        quoted: quotedMessage
                            ? {
                                message:
                                    quotedMessage
                            }
                            : null
                    }

                    /*
                     * FORMATO NUEVO
                     *
                     * export default {
                     *     command: ['ping'],
                     *     handler: async (m, { conn }) => {}
                     * }
                     */

                    if (
                        typeof plugin.handler ===
                        'function'
                    ) {

                        await plugin.handler(
                            m,
                            ctx
                        )

                    }

                    /*
                     * COMPATIBILIDAD
                     *
                     * Por si algún plugin
                     * exporta directamente
                     * una función.
                     */

                    else if (
                        typeof plugin ===
                        'function'
                    ) {

                        await plugin(
                            m,
                            ctx
                        )

                    }

                    else {

                        console.log(
                            `⚠️ ${filename} no tiene handler válido`
                        )

                    }

                    break
                }

            } catch (error) {

                console.error(
                    '❌ Error procesando mensaje:',
                    error
                )

            }
        }

    } catch (error) {

        console.error(
            '❌ Error general del handler:',
            error
        )

    }
}
