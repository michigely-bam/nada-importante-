import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginFolder = path.join(__dirname, 'Plugins')

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
        return plugin.command.some(cmd => {
            if (cmd instanceof RegExp) {
                cmd.lastIndex = 0
                const result = cmd.test(command)
                cmd.lastIndex = 0
                return result
            }

            return String(cmd).toLowerCase() === command.toLowerCase()
        })
    }

    if (typeof plugin.command === 'string') {
        return plugin.command.toLowerCase() === command.toLowerCase()
    }

    return false
}

async function loadPlugins(dir = pluginFolder) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        return
    }

    const entries = fs.readdirSync(dir, {
        withFileTypes: true
    })

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        // Entrar automáticamente en las subcarpetas
        if (entry.isDirectory()) {
            await loadPlugins(fullPath)
            continue
        }

        // Solo cargar archivos .js
        if (!entry.name.endsWith('.js')) continue

        const relativePath = path
            .relative(pluginFolder, fullPath)
            .replace(/\\/g, '/')

        try {
            const url = pathToFileURL(fullPath).href

            const module = await import(
                `${url}?update=${Date.now()}`
            )

            const plugin = module.default || module

            if (!plugin) {
                console.log(
                    `⚠️ Plugin vacío: ${relativePath}`
                )
                continue
            }

            global.plugins[relativePath] = plugin

            console.log(
                `✅ Plugin cargado: ${relativePath}`
            )

        } catch (error) {
            console.error(
                `❌ Error cargando ${relativePath}:`,
                error
            )
        }
    }
}

await loadPlugins()

export default async function handler(conn, m) {
    try {
        if (!m) return

        const messages = m.messages || [m]

        for (const msg of messages) {
            try {
                if (!msg?.message) continue

                if (
                    msg.key?.remoteJid === 'status@broadcast'
                ) {
                    continue
                }

                const text =
                    msg.text ||
                    msg.body ||
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    msg.message?.documentMessage?.caption ||
                    ''

                if (!text) continue

                const prefixMatch = text.match(/^[#!./]/)

                if (!prefixMatch) continue

                const usedPrefix = prefixMatch[0]

                const body = text
                    .slice(usedPrefix.length)
                    .trim()

                if (!body) continue

                const [command, ...args] = body.split(/\s+/)

                const commandLower =
                    command.toLowerCase()

                const argsText = args.join(' ')

                console.log(
                    `[CMD] ${usedPrefix}${commandLower}`,
                    argsText ? `| ${argsText}` : ''
                )

                for (
                    const [filename, plugin]
                    of Object.entries(global.plugins)
                ) {
                    if (!plugin) continue
                    if (plugin.disabled) continue

                    const matched =
                        getCommandMatch(
                            plugin,
                            commandLower
                        )

                    if (!matched) continue

                    console.log(
                        `🔧 Ejecutando plugin: ${filename}`
                    )

                    const ctx = {
                        conn,
                        usedPrefix,
                        command: commandLower,
                        text: argsText,
                        args,

                        isOwner: false,
                        isAdmin: false,
                        isBotAdmin: false,

                        participants: [],

                        quoted:
                            msg.message
                                ?.extendedTextMessage
                                ?.contextInfo
                                ?.quotedMessage
                                ? {
                                    message:
                                        msg.message
                                            .extendedTextMessage
                                            .contextInfo
                                            .quotedMessage
                                }
                                : null
                    }

                    try {
                        await plugin.call(
                            conn,
                            msg,
                            ctx
                        )
                    } catch (error) {
                        console.error(
                            `❌ Error ejecutando ${filename}:`,
                            error
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

export { loadPlugins }
