let handler = async (m, { conn }) => {
    await conn.sendMessage(m.chat, {
        text: '🏓 Pong!'
    }, { quoted: m })
}

handler.help = ['ping']
handler.tags = ['info']
handler.command = /^(ping|p)$/i

export default handler
