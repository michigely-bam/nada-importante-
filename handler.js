import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsPath = path.join(__dirname, 'plugins')

global.plugins = global.plugins || {}
global.pluginFiles = global.pluginFiles || new Map()

/* =========================================================
   COMPATIBILIDAD DE CONN
   ========================================================= */

function createCompatConn(conn) {

    if (!conn.reply) {
        conn.reply = async function (jid, text, quoted, options = {}) {

            if (!jid) return

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
        conn.sendText = async function (
            jid,
            text,
            quoted,
            options = {}
        ) {

            if (!jid) return

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

    if (!conn.getName) {
        conn.getName = async function (jid) {

            if (!jid) return ''

            try {
                return jid.split('@')[0]
            } catch {
                return jid
            }
        }
    }

    return conn
}

/* =========================================================
   BUSCAR ARCHIVOS RECURSIVAMENTE
   ========================================================= */

function getPluginFiles(dir, result = []) {

    if (!fs.existsSync(dir)) {
        return result
    }

    const entries = fs.readdirSync(
        dir,
        {
            withFileTypes: true
        }
    )

    for (const entry of entries) {

        const fullPath = path.join(
            dir,
            entry.name
        )

        if (entry.isDirectory()) {

            getPluginFiles(
                fullPath,
                result
            )

            continue
        }

        if (
            entry.isFile() &&
            entry.name.endsWith('.js') &&
            !entry.name.startsWith('_')
        ) {
            result.push(fullPath)
        }
    }

    return result
}

/* =========================================================
   NOMBRE DEL PLUGIN
   ========================================================= */

function getPluginName(filePath) {

    return path
        .relative(
            pluginsPath,
            filePath
        )
        .replace(/\\/g, '/')
}

/* =========================================================
   DETECTAR COMANDO
   ========================================================= */

function getCommandMatch(
    plugin,
    command
) {

    if (!plugin?.command) {
        return false
    }

    if (plugin.command instanceof RegExp) {

        plugin.command.lastIndex = 0

        const result =
            plugin.command.test(command)

        plugin.command.lastIndex = 0

        return result
    }

    if (Array.isArray(plugin.command)) {

        return plugin.command.some(cmd => {

            return String(cmd)
                .toLowerCase() ===
                command.toLowerCase()

        })
    }

    if (typeof plugin.command === 'string') {

        return plugin.command
            .toLowerCase() ===
            command.toLowerCase()
    }

    return false
}

/* =========================================================
   CARGAR UN PLUGIN
   ========================================================= */

async function loadPlugin(filePath) {

    try {

        const pluginName =
            getPluginName(filePath)

        const url =
            pathToFileURL(filePath).href

        const module =
            await import(
                `${url}?update=${Date.now()}`
            )

        if (!module.default) {

            console.log(
                `⚠️ Plugin sin export default: ${pluginName}`
            )

            return false
        }

        const stat =
            fs.statSync(filePath)

        global.plugins[pluginName] =
            module.default

        global.pluginFiles.set(
            pluginName,
            {
                path: filePath,
                mtime: stat.mtimeMs
            }
        )

        console.log(
            `✅ Plugin cargado: ${pluginName}`
        )

        return true

    } catch (error) {

        console.error(
            `❌ Error cargando plugin: ${filePath}`,
            error
        )

        return false
    }
}

/* =========================================================
   CARGAR TODOS LOS PLUGINS
   ========================================================= */

async function loadPlugins() {

    if (!fs.existsSync(pluginsPath)) {

        console.log(
            '❌ No existe la carpeta plugins:',
            pluginsPath
        )

        return
    }

    const files =
        getPluginFiles(pluginsPath)

    const currentFiles =
        new Set(
            files.map(file =>
                getPluginName(file)
            )
        )

    /* =====================================================
       ELIMINAR PLUGINS QUE YA NO EXISTEN
       ===================================================== */

    for (
        const pluginName
        of Object.keys(global.plugins)
    ) {

        if (!currentFiles.has(pluginName)) {

            delete global.plugins[pluginName]

            global.pluginFiles.delete(
                pluginName
            )

            console.log(
                `🗑️ Plugin eliminado: ${pluginName}`
            )
        }
    }

    /* =====================================================
       CARGAR / RECARGAR
       ===================================================== */

    for (const filePath of files) {

        const pluginName =
            getPluginName(filePath)

        try {

            const stat =
                fs.statSync(filePath)

            const old =
                global.pluginFiles.get(
                    pluginName
                )

            /*
             * Si no existe o cambió,
             * se vuelve a cargar.
             */

            if (
                !old ||
                old.mtime !== stat.mtimeMs
            ) {

                await loadPlugin(
                    filePath
                )
            }

        } catch (error) {

            console.error(
                `❌ Error revisando ${pluginName}:`,
                error
            )
        }
    }
}

/* =========================================================
   RELOAD MANUAL
   ========================================================= */

global.reloadPlugins = async function () {

    console.log(
        '🔄 Recargando plugins...'
    )

    /*
     * Forzamos la recarga eliminando
     * los registros anteriores.
     */

    global.pluginFiles.clear()

    await loadPlugins()

    console.log(
        `✅ Plugins cargados: ${
            Object.keys(global.plugins).length
        }`
    )

    return true
}

/* =========================================================
   RESTART
   ========================================================= */

global.restartBot = function () {

    console.log(
        '🔄 Reiniciando Tomoe...'
    )

    setTimeout(() => {

        process.exit(0)

    }, 500)

}

/* =========================================================
   CARGA INICIAL
   ========================================================= */

await loadPlugins()

/* =========================================================
   HOT RELOAD
   ========================================================= */

let lastPluginScan = 0

async function checkHotReload() {

    const now = Date.now()

    /*
     * Evita revisar el disco en cada mensaje.
     * Se revisa como máximo cada 2 segundos.
     */

    if (
        now - lastPluginScan <
        2000
    ) {
        return
    }

    lastPluginScan = now

    try {

        await loadPlugins()

    } catch (error) {

        console.error(
            '❌ Error en hot reload:',
            error
        )
    }
}

/* =========================================================
   OBTENER TEXTO DEL MENSAJE
   ========================================================= */

function getMessageText(m) {

    return (
        m?.message?.conversation ||
        m?.message?.extendedTextMessage?.text ||
        m?.message?.imageMessage?.caption ||
        m?.message?.videoMessage?.caption ||
        m?.message?.documentMessage?.caption ||
        m?.message?.buttonsResponseMessage?.selectedButtonId ||
        m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m?.message?.templateButtonReplyMessage?.selectedId ||
        ''
    )
}

/* =========================================================
   CREAR CONTEXTO
   ========================================================= */

function createPluginContext(
    conn,
    m,
    usedPrefix,
    command,
    text,
    quoted
) {

    const args =
        text
            ? text.split(/\s+/)
            : []

    return {

        conn,

        sock: conn,

        msg: m,

        m,

        usedPrefix,

        prefix: usedPrefix,

        command,

        text,

        body: text,

        args,

        participants: [],

        isOwner: false,

        isAdmin: false,

        isBotAdmin: false,

        quoted,

        pushName:
            m.pushName ||
            m.pushName ||
            '',

        chat: m.chat,

        sender: m.sender,

        isGroup: m.isGroup
    }
}

/* =========================================================
   EJECUTAR PLUGIN
   ========================================================= */

async function executePlugin(
    plugin,
    m,
    ctx
) {

    /*
     * FORMATO ANTIGUO DE TOMOE
     *
     * export default async function (m, ctx) {}
     */

    if (
        typeof plugin ===
        'function'
    ) {

        return await plugin(
            m,
            ctx
        )
    }

    /*
     * FORMATO NUEVO
     *
     * export default {
     *   command: ['ping'],
     *   async execute(m, ctx) {}
     * }
     */

    if (
        plugin &&
        typeof plugin.execute ===
        'function'
    ) {

        return await plugin.execute(
            m,
            ctx
        )
    }

    /*
     * Compatibilidad adicional
     * con plugins que utilizan
     * handler().
     */

    if (
        plugin &&
        typeof plugin.handler ===
        'function'
    ) {

        return await plugin.handler(
            m,
            ctx
        )
    }

    throw new Error(
        'El plugin no tiene una función ejecutable'
    )
}

/* =========================================================
   HANDLER PRINCIPAL
   ========================================================= */

export default async function handler(
    conn,
    update
) {

    try {

        if (
            !update?.messages?.length
        ) {
            return
        }

        conn =
            createCompatConn(conn)

        /*
         * Hot reload
         */

        await checkHotReload()

        /* =================================================
           PROCESAR MENSAJES
           ================================================= */

        for (
            const m
            of update.messages
        ) {

            try {

                if (!m?.message) {
                    continue
                }

                /* =========================================
                   DATOS BÁSICOS
                   ========================================= */

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
                    typeof m.chat ===
                    'string' &&
                    m.chat.endsWith(
                        '@g.us'
                    )

                if (!m.chat) {
                    continue
                }

                /* =========================================
                   IGNORAR ESTADOS
                   ========================================= */

                if (
                    m.chat ===
                    'status@broadcast'
                ) {
                    continue
                }

                /* =========================================
                   TEXTO
                   ========================================= */

                const message =
                    getMessageText(m)

                if (!message) {
                    continue
                }

                /* =========================================
                   PREFIJO
                   ========================================= */

                const prefixMatch =
                    message.match(
                        /^[#!./]/
                    )

                if (!prefixMatch) {
                    continue
                }

                const usedPrefix =
                    prefixMatch[0]

                /* =========================================
                   CUERPO
                   ========================================= */

                const body =
                    message
                        .slice(
                            usedPrefix.length
                        )
                        .trim()

                if (!body) {
                    continue
                }

                /* =========================================
                   COMANDO
                   ========================================= */

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

                /* =========================================
                   BUSCAR PLUGIN
                   ========================================= */

                for (
                    const [
                        filename,
                        plugin
                    ]
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

                    /* =====================================
                       QUOTED
                       ===================================== */

                    const quotedMessage =
                        m.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.quotedMessage

                    let quoted = null

                    if (
                        quotedMessage
                    ) {

                        quoted = {
                            message:
                                quotedMessage
                        }
                    }

                    /* =====================================
                       CONTEXTO
                       ===================================== */

                    const ctx =
                        createPluginContext(
                            conn,
                            m,
                            usedPrefix,
                            command,
                            text,
                            quoted
                        )

                    /* =====================================
                       EJECUTAR
                       ===================================== */

                    try {

                        await executePlugin(
                            plugin,
                            m,
                            ctx
                        )

                    } catch (error) {

                        console.error(
                            `❌ Error en plugin ${filename}:`,
                            error
                        )

                        try {

                            await conn.sendMessage(
                                m.chat,
                                {
                                    text:
                                        `❌ Error ejecutando el comando.\n\n${error?.message || error}`
                                },
                                {
                                    quoted: m
                                }
                            )

                        } catch {}
                    }

                    /*
                     * Solo ejecutamos el primer
                     * plugin que coincida.
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
