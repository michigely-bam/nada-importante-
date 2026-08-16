import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginFolder = path.join(__dirname, 'Plugins')

global.plugins = global.plugins || {}

async function loadPlugins() {
    if (!fs.existsSync(pluginFolder)) {
        fs.mkdirSync(pluginFolder, { recursive: true })
    }

    const files = fs.readdirSync(pluginFolder)
        .filter(file => file.endsWith('.js'))

    for (const file of files) {
        try {
            const filePath = path.join(pluginFolder, file)
            const url = pathToFileURL(filePath).href

            const plugin = await import(`${url}?update=${Date.now()}`)

            global.plugins[file] = plugin.default || plugin

            console.log(`✅ Plugin cargado: ${file}`)
        } catch (e) {
            console.error(`❌ Error cargando ${file}:`, e)
        }
    }
}

await loadPlugins()

export default async function handler(conn, m) {
    try {
        if (!m) return

        const text =
            m.text ||
            m.body ||
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            ''

        if (!text) return

        const prefixMatch = text.match(/^[#!./]/)

        if (!prefixMatch) return

        const usedPrefix = prefixMatch[0]

        const body = text.slice(usedPrefix.length).trim()

        if (!body) return

        const [command, ...args] = body.split(/\s+/)

        const commandLower = command.toLowerCase()

        const pluginList = Object.values(global.plugins)

        for (const plugin of pluginList) {

            if (!plugin || plugin.disabled) continue

            if (!plugin.command) continue

            let matched = false

            if (plugin.command instanceof RegExp) {
                matched = plugin.command.test(commandLower)

                // Evita problemas con regex que tengan /g
                plugin.command.lastIndex = 0

            } else if (Array.isArray(plugin.command)) {
                matched = plugin.command.some(cmd => {
                    if (cmd instanceof RegExp) {
                        const result = cmd.test(commandLower)
                        cmd.lastIndex = 0
                        return result
                    }

                    return String(cmd).toLowerCase() === commandLower
                })
            } else if (typeof plugin.command === 'string') {
                matched =
                    plugin.command.toLowerCase() === commandLower
            }

            if (!matched) continue

            const argsText = args.join(' ')

            const ctx = {
                conn,
                usedPrefix,
                command: commandLower,
                text: argsText,
                args,
                isOwner: false,
                isAdmin: false,
                isBotAdmin: false
            }

            try {
                await plugin.call(conn, m, ctx)
            } catch (error) {
                console.error(
                    `❌ Error ejecutando plugin ${commandLower}:`,
                    error
                )
            }

            break
        }

    } catch (error) {
        console.error('❌ Error en handler:', error)
    }
}

export { loadPlugins }
