import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsPath = path.join(__dirname, 'plugins')

global.plugins = global.plugins || {}


/* =========================================================
   COMPATIBILIDAD DE CONN
   ========================================================= */

function createCompatConn(conn) {

    // conn.reply()
    if (!conn.reply) {
        conn.reply = async function (jid, text, quoted, options = {}) {

            if (!jid) {
                console.error('❌ conn.reply: jid undefined')
                return
            }

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


    // conn.sendText()
    if (!conn.sendText) {
        conn.sendText = async function (
            jid,
            text,
            quoted,
            options = {}
        ) {

            if (!jid) {
                console.error('❌ conn.sendText: jid undefined')
                return
            }

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


    // conn.react()
    if (!conn.react) {
        conn.react = async function (
            jid,
            key,
            emoji
        ) {

            if (!jid || !key) return

            return await conn.sendMessage(
                jid,
                {
                    react: {
                        text: emoji,
                        key
                    }
                }
            )
        }
    }


    // conn.getName()
    if (!conn.getName) {
        conn.getName = async function (jid) {

            if (!jid) return ''

            try {

                if (
                    jid.endsWith('@s.whatsapp.net') ||
                    jid.endsWith('@lid')
                ) {
                    return jid.split('@')[0]
                }

                return jid.split('@')[0]

            } catch {
                return jid
            }
        }
    }


    return conn
}


/* =========================================================
   DETECTAR COMANDO DEL PLUGIN
   ========================================================= */

function getCommandMatch(plugin, command) {

    if (!plugin?.command) {
        return false
    }


    // RegExp
    if (plugin.command instanceof RegExp) {

        plugin.command.lastIndex = 0

        const result =
            plugin.command.test(command)

        plugin.command.lastIndex = 0

        return result
    }


    // Array
    if (Array.isArray(plugin.command)) {

        return plugin.command.some(cmd => {

            return String(cmd)
                .toLowerCase() ===
                command.toLowerCase()

        })
    }


    // String
    if (typeof plugin.command === 'string') {

        return plugin.command
            .toLowerCase() ===
            command.toLowerCase()
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
        .filter(file =>
            file.endsWith('.js')
        )


    for (const file of files) {

        try {

            const filePath =
                path.join(
                    pluginsPath,
                    file
                )


            const url =
                pathToFileURL(filePath).href


            const module =
                await import(
                    `${url}?update=${Date.now()}`
                )


            if (module.default) {

                global.plugins[file] =
                    module.default

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

export default async function handler(
    conn,
    update
) {

    try {

        if (!update?.messages?.length) {
            return
        }


        /*
         * Añadir compatibilidad al conn
         */

        conn = createCompatConn(conn)


        /* =====================================================
           PROCESAR MENSAJES
           ===================================================== */

        for (const m of update.messages) {

            try {

                if (!m?.message) {
                    continue
                }


                /* =================================================
                   COMPATIBILIDAD DEL MENSAJE
                   ================================================= */

                /*
                 * Los plugins antiguos esperan:
                 *
                 * m.chat
                 * m.sender
                 * m.fromMe
                 * m.isGroup
                 */

                m.chat =
                    m.key?.remoteJid ||
                    ''


                m.sender =
                    m.key?.participant ||
                    m.key?.remoteJid ||
                    ''


                m.fromMe =
                    !!m.key?.fromMe


                m.isGroup =
                    typeof m.chat === 'string' &&
                    m.chat.endsWith('@g.us')


                /*
                 * Si no tenemos chat no podemos responder
                 */

                if (!m.chat) {
                    continue
                }


                /* =================================================
                   IGNORAR ESTADOS
                   ================================================= */

                if (
                    m.chat ===
                    'status@broadcast'
                ) {
                    continue
                }


                /* =================================================
                   OBTENER TEXTO
                   ================================================= */

                const message =
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    m.message.imageMessage?.caption ||
                    m.message.videoMessage?.caption ||
                    m.message.documentMessage?.caption ||
                    m.message.buttonsResponseMessage?.selectedButtonId ||
                    m.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                    m.message.templateButtonReplyMessage?.selectedId ||
                    ''


                if (!message) {
                    continue
                }


                /* =================================================
                   DETECTAR PREFIJO
                   ================================================= */

                const prefixMatch =
                    message.match(
                        /^[#!./]/
                    )


                if (!prefixMatch) {
                    continue
                }


                const usedPrefix =
                    prefixMatch[0]


                /* =================================================
                   QUITAR PREFIJO
                   ================================================= */

                const body =
                    message
                        .slice(
                            usedPrefix.length
                        )
                        .trim()


                if (!body) {
                    continue
                }


                /* =================================================
                   COMANDO Y TEXTO
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
                    of Object.entries(
                        global.plugins
                    )
                ) {

                    if (!plugin) {
                        continue
                    }


                    const matched =
                        getCommandMatch(
                            plugin,
                            command
                        )


                    if (!matched) {
                        continue
                    }


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


                    let quoted = null


                    if (quotedMessage) {

                        quoted = {

                            message:
                                quotedMessage
                        }
                    }


                    /* =================================================
                       CONTEXTO PARA PLUGINS
                       ================================================= */

                    const ctx = {

                        /*
                         * Conexión Baileys
                         */
                        conn,


                        /*
                         * Prefijo utilizado
                         */
                        usedPrefix,


                        /*
                         * Comando
                         */
                        command,


                        /*
                         * Texto después del comando
                         */
                        text,


                        /*
                         * Argumentos
                         */
                        args:
                            text
                                ? text.split(/\s+/)
                                : [],


                        /*
                         * Grupo
                         */
                        participants: [],


                        /*
                         * Permisos
                         */
                        isOwner: false,

                        isAdmin: false,

                        isBotAdmin: false,


                        /*
                         * Mensaje citado
                         */
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


                    /*
                     * Solo ejecutar el primer
                     * plugin que coincida
                     */

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
