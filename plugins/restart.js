export default {
    name: 'restart',
    command: ['restart', 'reiniciar'],
    description: 'Reinicia el bot',
    category: 'owner',

    async execute(m, { conn }) {

        await conn.sendMessage(
            m.chat,
            {
                text: '🔄 Reiniciando el bot...'
            },
            {
                quoted: m
            }
        )

        setTimeout(() => {
            process.exit(0)
        }, 1000)
    }
}
