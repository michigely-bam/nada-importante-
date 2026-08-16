import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsPath = path.join(__dirname, 'plugins')

global.plugins = global.plugins || {}
global.pluginFiles = global.pluginFiles || new Map()

/* =========================================================
   BUSCAR PLUGINS RECURSIVAMENTE
   ========================================================= */

function getPluginFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files

    for (const entry of fs.readdirSync(dir, {
        withFileTypes: true
    })) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            getPluginFiles(fullPath, files)
            continue
        }

        if (
            entry.isFile() &&
            entry.name.endsWith('.js') &&
            !entry.name.startsWith('_')
        ) {
            files.push(fullPath)
        }
    }

    return files
}

/* =========================================================
   NOMBRE RELATIVO DEL PLUGIN
   ========================================================= */

function getPluginName(filePath) {
    return path
        .relative(pluginsPath, filePath)
        .replace(/\\/g, '/')
}

/* =========================================================
   BUSCAR COMANDO
   ========================================================= */

function getCommandMatch(plugin, command) {
    if (!plugin?.command) return false

    if (plugin.command instanceof RegExp) {
        plugin.command.lastIndex = 0

        const result =
            plugin.command.test(command)

        plugin.command.lastIndex = 0

        return result
    }

    if (Array.isArray(plugin.command)) {
        return plugin.command.some(cmd =>
            String(cmd).toLowerCase() ===
            command.toLowerCase()
        )
    }

    if (typeof plugin.command === 'string') {
        return plugin.command.toLowerCase() ===
            command.toLowerCase()
    }

    return false
}

/* =========================================================
   CARGAR UN PLUGIN
   ========================================================= */

async function loadPlugin(filePath) {
    try {
        const name = getPluginName(filePath)

        const url =
            pathToFileURL(filePath).href

        const module =
            await import(
                `${url}?update=${Date.now()}`
            )

        if (!module.default) {
            console.log(
                `⚠️ Plugin sin export default: ${name}`
            )
            return
        }

        global.plugins[name] =
            module.default

        const stat =
            fs.statSync(filePath)

        global.pluginFiles.set(name, {
            path: filePath,
            mtime: stat.mtimeMs
        })

        console.log(
            `✅ Plugin cargado: ${name}`
        )

    } catch (error) {
        console.error(
            `❌ Error cargando plugin ${filePath}:`,
            error
        )
    }
}

/* =========================================================
   CARGAR TODOS LOS PLUGINS
   ========================================================= */

async function loadPlugins(force = false) {

    if (!fs.existsSync(pluginsPath)) {
        console.log(
            `❌ No existe la carpeta: ${pluginsPath}`
        )
        return
    }

    const files =
        getPluginFiles(pluginsPath)

    const currentFiles =
        new Set(
            files.map(getPluginName)
        )

    /* Eliminar plugins borrados */

    for (
        const name of Object.keys(global.plugins)
    ) {
        if (!currentFiles.has(name)) {

            delete global.plugins[name]

            global.pluginFiles.delete(name)

            console.log(
                `🗑️ Plugin eliminado: ${name}`
            )
        }
    }

    /* Cargar / actualizar plugins */

    for (const filePath of files) {

        const name =
            getPluginName(filePath)

        try {
            const stat =
                fs.statSync(filePath)

            const old =
                global.pluginFiles.get(name)

            if (
                force ||
                !old ||
                old.mtime !== stat.mtimeMs
            ) {
                await loadPlugin(filePath)
            }

        } catch (error) {
            console.error(
                `❌ Error revisando ${name}:`,
                error
            )
        }
    }
}

/* =========================================================
   RELOAD MANUAL
   ========================================================= */

global.reloadPlugins = async () => {

    console.log(
        '🔄 Recargando plugins...'
    )

    await loadPlugins(true)

    console.log(
        `✅ Plugins activos: ${
            Object.keys(global.plugins).length
        }`
    )
}

/* =========================================================
   RESTART
   ========================================================= */

global.restartBot = () => {

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

let lastScan = 0

async function hotReload() {

    const now = Date.now()

    if (now - lastScan < 1500) {
        return
    }

    lastScan = now

    await loadPlugins(false)
}

/* =========================================================
   OBTENER TEXTO
   ========================================================= */

function getMessageText(m) {

    return (
        m?.message?.conversation ||
        m?.message?.extendedTextMessage?.text ||
        m?.message?.imageMessage?.caption ||
        m?.message?.videoMessage?.caption ||
        m?.message?.documentMessage?.caption ||
        m?.message?.buttonsResponseMessage
            ?.selectedButtonId ||
        m?.message?.listResponseMessage
            ?.singleSelectReply
            ?.selectedRowId ||
        m?.message?.templateButtonReplyMessage
            ?.selectedId ||
        ''
    )
}

/* =========================================================
   CREAR CONTEXTO
   ========================================================= */

function createContext(
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

        quoted,

        chat: m.chat,
        sender: m.sender,

        pushName:
            m.pushName ||
            '',

        isGroup:
            m.isGroup || false,

        participants: [],

        isOwner: false,
        isAdmin: false,
        isBotAdmin: false
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
     * FORMATO 1
     *
     * export default async function (m, ctx) {}
     */

    if (typeof plugin === 'function') {

        return await plugin(
            m,
            ctx
        )
    }

    /*
     * FORMATO 2
     *
     * export default {
     *     command: ['ping'],
     *
     *     async execute(m, ctx) {}
     * }
     */

    if (
        plugin &&
        typeof plugin.execute === 'function'
    ) {

        return await plugin.execute(
            m,
            ctx
        )
    }

    /*
     * FORMATO 3
     *
     * handler()
     */

    if (
        plugin &&
        typeof plugin.handler === 'function'
    ) {

        return await plugin.handler(
            m,
            ctx
        )
    }

    throw new Error(
        'El plugin no tiene execute(), handler() ni es una función'
    )
}

/* =========================================================
   HANDLER
   ========================================================= */

export default async function handler(
    conn,
    update
) {

    try {

        if (!update?.messages?.length) {
            return
        }

        await hotReload()

        for (
            const m
            of update.messages
        ) {

            try {

                if (!m?.message) {
                    continue
                }

                /* ==============================
                   DATOS DEL MENSAJE
                   ============================== */

                m.chat =
                    m.key?.remoteJid || ''

                m.sender =
                    m.key?.participant ||
                    m.key?.remoteJid ||
                    ''

                m.fromMe =
                    !!m.key?.fromMe

                m.isGroup =
                    m.chat.endsWith('@g.us')

                if (!m.chat) {
                    continue
                }

                /* ==============================
                   STATUS
                   ============================== */

                if (
                    m.chat ===
                    'status@broadcast'
                ) {
                    continue
                }

                /* ==============================
                   TEXTO
                   ============================== */

                const message =
                    getMessageText(m)

                if (!message) {
                    continue
                }

                /* ==============================
                   PREFIJO
                   ============================== */

                const prefixMatch =
                    message.match(/^[#!./]/)

                if (!prefixMatch) {
                    continue
                }

                const usedPrefix =
                    prefixMatch[0]

                /* ==============================
                   BODY
                   ============================== */

                const body =
                    message
                        .slice(
                            usedPrefix.length
                        )
                        .trim()

                if (!body) {
                    continue
                }

                /* ==============================
                   COMMAND
                   ============================== */

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

                /* ==============================
                   BUSCAR PLUGIN
                   ============================== */

                let found = false

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

                    if (
                        !getCommandMatch(
                            plugin,
                            command
                        )
                    ) {
                        continue
                    }

                    found = true

                    console.log(
                        `🔧 Ejecutando plugin: ${filename}`
                    )

                    /* ==========================
                       QUOTED
                       ========================== */

                    const quotedMessage =
                        m.message
                            ?.extendedTextMessage
                            ?.contextInfo
                            ?.quotedMessage

                    const quoted =
                        quotedMessage
                            ? {
                                message:
                                    quotedMessage
                            }
                            : null

                    /* ==========================
                       CONTEXTO
                       ========================== */

                    const ctx =
                        createContext(
                            conn,
                            m,
                            usedPrefix,
                            command,
                            text,
                            quoted
                        )

                    /* ==========================
                       EJECUTAR
                       ========================== */

                    try {

                        await executePlugin(
                            plugin,
                            m,
                            ctx
                        )

                    } catch (error) {

                        console.error(
                            `❌ Error en ${filename}:`,
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

                    break
                }

                if (!found) {
                    console.log(
                        `⚠️ Comando no encontrado: ${command}`
                    )
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
