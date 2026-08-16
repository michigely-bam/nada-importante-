import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsPath = path.join(__dirname, 'plugins')

global.plugins = global.plugins || {}


/* =========================================================
   COMPATIBILIDAD CON PLUGINS ANTIGUOS
   ========================================================= */

function createCompatConn(conn) {

    if (!conn.reply) {
        conn.reply = async function (jid, text, quoted, options = {}) {
            return await conn.sendMessage(
                jid,
                {
                    text: String(text ?? ''),
                    ...options
                },
                {
                    quoted: quoted || undefined
                }
            )
        }
    }

    if (!conn.sendText) {
        conn.sendText = async function (jid, text, quoted, options = {}) {
            return await conn.sendMessage(
                jid,
                {
                    text: String(text ?? ''),
                    ...options
                },
                {
                    quoted: quoted || undefined
                }
            )
        }
    }

    if (!conn.react) {
        conn.react = async function (jid, key, emoji) {
            return await conn.sendMessage(jid, {
                react: {
                    text: emoji,
                    key
                }
            })
        }
    }

    return conn
}


/* =========================================================
   MATCH DE COMANDOS
   ========================================================= */

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


/* =========================================================
   CARGAR PLUGINS
   ========================================================= */

async function loadPlugins() {

    if (!fs.existsSync(pluginsPath)) {

        console.log(
            '❌ No existe la carpeta plugins:',
            pluginsPath
        )

        return
    }

    const files = fs.readdirSync(pluginsPath)
        .filter(file => file.endsWith('.js'))

    for (const file of files) {

        try {

            const filePath = path.join(
                pluginsPath,
                file
            )

            const url = pathToFileURL(filePath).href

            const module = await import(
                `${url}?update=${Date.now()}`
            )

            if (module.default) {

                global.plugins[file] = module.default

                console.log(
                    `✅ Plugin cargado: ${file}`
                )

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


/* =========================================================
   HANDLER PRINCIPAL
   ========================================================= */

export default async function handler(conn, update) {

    try {

        if (!update?.messages?.length) return


        /*
         * Añadimos compatibilidad al conn original.
         *
         * Así los plugins pueden seguir utilizando:
         *
         * conn.reply()
         * conn.sendText()
         * conn.sendMessage()
         */

        conn = createCompatConn(conn)


        for (const m of update.messages) {

            try {

                if (!m?.message) continue


                /* Ignorar estados */

                if (
                    m.key?.remoteJid === 'status@broadcast'
                ) {
                    continue
                }


                /* =================================================
                   OBTENER TEXTO DEL MENSAJE
                   ================================================= */

                const message =
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    m.message.imageMessage?.caption ||
                    m.message.videoMessage?.caption ||
                    m.message.documentMessage?.caption ||
                    ''


                if (!message) continue


                /* =================================================
                   PREFIJO
                   ================================================= */

                const prefixMatch =
                    message.match(/^[#!./]/)

                if (!prefixMatch) continue

                const usedPrefix =
                    prefixMatch[0]


                /* =================================================
                   BODY
                   ================================================= */

                const body =
                    message
                        .slice(usedPrefix.length)
                        .trim()

                if (!body) continue


                /* =================================================
                   COMANDO + ARGUMENTOS
                   ================================================= */

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
                    text
                        ? `| ${text}`
                        : ''
                )


                /* =================================================
                   BUSCAR PLUGIN
                   ================================================= */

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


                    /* =================================================
                       QUOTED
                       ================================================= */

                    const quotedMessage =
                        m.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.quotedMessage


                    const quoted =
                        quotedMessage
                            ? {
                                message: quotedMessage
                            }
                            : null


                    /* =================================================
                       CONTEXTO DEL PLUGIN
                       ================================================= */

                    const ctx = {

                        conn,

                        usedPrefix,

                        command,

                        text,

                        args:
                            text
                                ? text.split(/\s+/)
                                : [],

                        participants: [],

                        isOwner: false,

                        isAdmin: false,

                        isBotAdmin: false,

                        quoted

                    }


                    /* =================================================
                       EJECUTAR PLUGIN
                       ================================================= */

                    await plugin.call(
                        null,
                        m,
                        ctx
                    )


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
