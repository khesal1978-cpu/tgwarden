async function checkAdmin(ctx) {
    if(ctx.chat.type === 'private') return true; 
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

function setupSettings(bot) {
    bot.command('settings', async (ctx) => {
        if (ctx.chat.type === 'private') return ctx.reply('Use this command in a group.');
        if (!(await checkAdmin(ctx))) return ctx.reply('Only admins can view settings.');

        const text = `⚙️ **Group Settings**\n\n` +
                     `🛡️ **Security Profile: ACTIVE (Auto)**\n` +
                     `*(Anti-Spam, Links, Bio-Links, Service Msgs, and Promo Checks are wiped automatically)*\n\n` +
                     `👋 **Welcome Message:** Permanently Disabled\n`;

        ctx.replyWithMarkdown(text);
    });
}

module.exports = { setupSettings };
