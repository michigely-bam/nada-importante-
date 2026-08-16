
let handler = async (m, { conn }) => {
    const messageTimestamp =
        m.messageTimestamp ||
        m.message?.messageTimestamp

    const userSendTime = Number(messageTimestamp) * 1000
    const ping = Date.now() - userSendTime

    await conn.sendMessage(
        m.key.remoteJid,
        {
            text: `🌠 ¡Pong!\n> *Velocidad ⧖ ${ping}ms*`
        },
        {
            quoted: m
        }
    )
}

handler.help = ['ping']
handler.tags = ['main']
handler.command = ['ping', 'speed', 'p', 'test']

export default handler
