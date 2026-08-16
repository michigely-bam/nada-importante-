import { prepareWAMessageMedia } from '@whiskeysockets/baileys'

const toBold = (str = '') => {
    const map = {
        A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',
        I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',
        Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',
        Y:'𝙔',Z:'𝙕',
        a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',
        i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',
        q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',
        y:'𝙮',z:'𝙯',
        0:'𝟬',1:'𝟭',2:'𝟮',3:'𝟯',4:'𝟰',
        5:'𝟱',6:'𝟲',7:'𝟳',8:'𝟴',9:'𝟵'
    }

    return String(str)
        .split('')
        .map(c => map[c] || c)
        .join('')
}

/* =========================================================
   CATEGORÍAS
   ========================================================= */

const sinonimosCategorias = {
    grupo: 'Grupo',
    group: 'Grupo',

    descargas: 'Descargas',
    download: 'Descargas',
    downloader: 'Descargas',

    herramientas: 'Herramientas',
    tools: 'Herramientas',

    diversión: 'Diversion',
    diversion: 'Diversion',

    economia: 'Economy',
    economy: 'Economy',

    ai: 'AI',

    owner: 'Owner',
    main: 'Main',
    admin: 'Admin',

    gacha: 'Gacha',
    search: 'Search',

    'sub-bot': 'Sub-Bot',
    subbot: 'Sub-Bot',

    utilidad: 'Utilidad',
    varios: 'Varios'
}

const capitalize = str =>
    str.charAt(0).toUpperCase() + str.slice(1)

function normalizarCategoria(cat) {

    if (!cat) {
        return 'Sin Categoria'
    }

    const normalizada =
        String(cat)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()

    return (
        sinonimosCategorias[normalizada] ||
        capitalize(normalizada)
    )
}

/* =========================================================
   OBTENER NOMBRE DEL PLUGIN
   ========================================================= */

function getPluginName(plugin) {

    if (plugin?.name) {
        return plugin.name
    }

    return null
}

/* =========================================================
   OBTENER COMANDOS
   ========================================================= */

function getPluginCommands(plugin) {

    if (!plugin) {
        return []
    }

    let commands = []

    if (Array.isArray(plugin.command)) {
        commands.push(...plugin.command)
    } else if (typeof plugin.command === 'string') {
        commands.push(plugin.command)
    }

    /*
     * También soporta plugins que tengan help
     */

    if (
        Array.isArray(plugin.help)
    ) {
        commands.push(...plugin.help)
    }

    return [
        ...new Set(
            commands
                .filter(Boolean)
                .map(String)
        )
    ]
}

/* =========================================================
   GENERAR LISTA
   ========================================================= */

function generarListaComandos(
    plugins,
    prefix
) {

    if (!plugins) {
        return ''
    }

    const categorias = {}
    const comandosVistos = new Set()

    for (
        const [pluginPath, plugin]
        of Object.entries(plugins)
    ) {

        if (!plugin) {
            continue
        }

        const comandos =
            getPluginCommands(plugin)

        if (!comandos.length) {
            continue
        }

        /*
         * Tomoe utiliza tags.
         * También aceptamos category por compatibilidad.
         */

        let tags = []

        if (Array.isArray(plugin.tags)) {
            tags = plugin.tags
        } else if (typeof plugin.tags === 'string') {
            tags = [plugin.tags]
        } else if (plugin.category) {
            tags = [plugin.category]
        } else {
            tags = ['Sin Categoria']
        }

        for (const tag of tags) {

            const categoria =
                normalizarCategoria(tag)

            if (!categorias[categoria]) {
                categorias[categoria] = []
            }

            for (const comando of comandos) {

                const key =
                    `${categoria}:${comando}`

                if (comandosVistos.has(key)) {
                    continue
                }

                comandosVistos.add(key)

                categorias[categoria].push({
                    comando,
                    plugin,
                    pluginPath
                })
            }
        }
    }

    let lista = ''

    const categoriasOrdenadas =
        Object.keys(categorias).sort()

    for (
        const categoria
        of categoriasOrdenadas
    ) {

        const comandos =
            categorias[categoria]

        comandos.sort((a, b) =>
            a.comando.localeCompare(
                b.comando
            )
        )

        lista +=
            `\n╭━━〔 ${categoria.toUpperCase()} 〕━━╮\n`

        lista +=
            `┃ 📚 Comandos\n`

        for (const item of comandos) {

            lista +=
                `┃ ✦ *${prefix}${item.comando}*\n`
        }

        lista +=
            `╰━━━━━━━━━━━━━━╯\n\n`
    }

    return lista
}

/* =========================================================
   MENU TOMOE
   ========================================================= */

let handler = async (
    m,
    {
        conn,
        usedPrefix
    }
) => {

    try {

        const sender =
            m.key?.participant ||
            m.key?.remoteJid ||
            m.sender

        const phone =
            String(sender)
                .split('@')[0]

        const plugins =
            global.plugins || {}

        /*
         * Configuración de Tomoe
         */

        const botNombre =
            global.botname ||
            global.nombre ||
            global.botName ||
            'TOMOE'

        const botTipo =
            global.tipo ||
            'PRINCIPAL'

        const developer =
            global.author ||
            global.ownerName ||
            phone

        const prefix =
            usedPrefix ||
            global.prefix ||
            '.'

        const webLink =
            global.web ||
            'https://wa.me/'

        const bannerUrl =
            global.banner ||
            ''

        /*
         * Generar comandos
         */

        const listaComandos =
            generarListaComandos(
                plugins,
                prefix
            )

        /*
         * Contar plugins
         */

        const totalPlugins =
            Object.keys(plugins).length

        /*
         * Texto del menú
         */

        const menuText = `
╭━━━〔 🌌 ${toBold(botNombre)} 〕━━━╮
┃ 👋 Hola @${phone}
┃
┃ 🤖 Tipo: ${toBold(botTipo)}
┃ 👑 Dev: ${developer}
┃ 🌐 Web:
┃ ${webLink}
╰━━━━━━━━━━━━━━╯

${listaComandos}

╭━━〔 ⚡ INFO 〕━━╮
┃ 📦 Plugins: ${totalPlugins}
┃ 🔋 Sistema activo
╰━━━━━━━━━━━━━━╯
`

        /*
         * Evitamos metadata de canales
         */

        const contextInfo = {}

        /* =================================================
           VIDEO MP4
           ================================================= */

        if (
            bannerUrl &&
            bannerUrl
                .toLowerCase()
                .includes('.mp4')
        ) {

            await conn.sendMessage(
                m.chat,
                {
                    video: {
                        url: bannerUrl
                    },

                    caption: menuText,

                    mentions: [sender],

                    gifPlayback: true,

                    mimetype:
                        'video/mp4',

                    contextInfo
                },
                {
                    quoted: m
                }
            )

            return
        }

        /* =================================================
           IMAGEN
           ================================================= */

        if (bannerUrl) {

            try {

                const uploadMethod =
                    conn.waUploadToServer ||
                    conn.updateMediaMessage

                const {
                    imageMessage
                } =
                    await prepareWAMessageMedia(
                        {
                            image: {
                                url: bannerUrl
                            }
                        },
                        {
                            upload:
                                uploadMethod,

                            mediaTypeOverride:
                                'thumbnail-link'
                        }
                    )

                const linkPreview = {
                    'canonical-url':
                        webLink,

                    'matched-text':
                        webLink,

                    title:
                        `${botNombre} - ${botTipo}`,

                    description:
                        `Bot de WhatsApp | Dev: ${developer}`,

                    jpegThumbnail:
                        imageMessage?.jpegThumbnail
                            ? Buffer.from(
                                imageMessage.jpegThumbnail
                            )
                            : undefined,

                    highQualityThumbnail:
                        imageMessage || undefined
                }

                await conn.sendMessage(
                    m.chat,
                    {
                        text: menuText,

                        mentions: [
                            sender
                        ],

                        linkPreview,

                        contextInfo
                    },
                    {
                        quoted: m
                    }
                )

            } catch (error) {

                console.error(
                    'Error con banner en menu:',
                    error
                )

                await conn.sendMessage(
                    m.chat,
                    {
                        text: menuText,

                        mentions: [
                            sender
                        ],

                        contextInfo
                    },
                    {
                        quoted: m
                    }
                )
            }

            return
        }

        /* =================================================
           SIN BANNER
           ================================================= */

        await conn.sendMessage(
            m.chat,
            {
                text: menuText,

                mentions: [
                    sender
                ],

                contextInfo
            },
            {
                quoted: m
            }
        )

    } catch (error) {

        console.error(
            '❌ Error en menu:',
            error
        )

        await conn.sendMessage(
            m.chat,
            {
                text:
                    `❌ Error en el menú:\n${error?.message || error}`
            },
            {
                quoted: m
            }
        )
    }
}

/* =========================================================
   METADATA TOMOE
   ========================================================= */

handler.help = [
    'menu',
    'help',
    'menú',
    'comandos'
]

handler.tags = [
    'main'
]

handler.command = [
    'menu',
    'help',
    'menú',
    'comandos'
]

export default handler
