let handler = async (m, { conn }) => {
    await conn.sendMessage(m.chat, { text: '🏓 Pong!' }, { quoted: m })
}

handler.command = ['ping']

export default handler
