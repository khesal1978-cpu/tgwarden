async function checkAdmin(ctx) {
    if(ctx.chat.type === 'private') return false;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

function setupRules(bot) {
    bot.command('setrules', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) return ctx.reply('Please provide the rules. Example: /setrules 1. Be nice');

        try {
            await ctx.dbAsync.run(
                `INSERT INTO group_settings (chat_id, rules) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET rules=excluded.rules`,
                [ctx.chat.id, text]
            );
            ctx.reply('Rules updated successfully.');
        } catch(e) {
            ctx.reply('Failed to update rules.');
        }
    });

    bot.command('rules', async (ctx) => {
        if (ctx.chat.type === 'private') return;
        try {
            const row = await ctx.dbAsync.get(`SELECT rules FROM group_settings WHERE chat_id = ?`, [ctx.chat.id]);
            const rules = (row && row.rules) ? row.rules : 'No rules set for this group yet.';
            ctx.reply(`📜 **Group Rules:**\n\n${rules}`, { parse_mode: 'Markdown' });
        } catch(e) {
            ctx.reply('Failed to fetch rules.');
        }
    });
}

module.exports = { setupRules };
