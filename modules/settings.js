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

        ctx.db.get('SELECT * FROM group_settings WHERE chat_id = ?', [ctx.chat.id], (err, row) => {
            const settings = row || {
                welcome_message: 'Welcome to the group!',
                welcome_enabled: 1
            };

            const text = `⚙️ **Group Settings**\n\n` +
                         `🛡️ **Security Profile: ACTIVE (Auto)**\n` +
                         `*(Anti-Spam, Links, Bio-Links, Service Msgs are wiped automatically)*\n\n` +
                         `👋 **Welcome Message On:** ${settings.welcome_enabled ? '✅' : '❌'}\n` +
                         `**Message:** ${settings.welcome_message}\n\n` +
                         `*To change, use /setwelcome or /togglewelcome*`;

            ctx.replyWithMarkdown(text);
        });
    });

    bot.command('setwelcome', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const msg = ctx.message.text.split(' ').slice(1).join(' ');
        if (!msg) return ctx.reply('Please provide a message. Example: /setwelcome Hello {name}!');

        ctx.db.run(`INSERT INTO group_settings (chat_id, welcome_message) VALUES (?, ?) 
                    ON CONFLICT(chat_id) DO UPDATE SET welcome_message=excluded.welcome_message`, 
                    [ctx.chat.id, msg], (err) => {
            if (err) return ctx.reply('Error saving settings.');
            ctx.reply('Welcome message updated!');
        });
    });

    bot.command('togglewelcome', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        
        ctx.db.get(`SELECT welcome_enabled FROM group_settings WHERE chat_id = ?`, [ctx.chat.id], (err, row) => {
            const current = row ? row.welcome_enabled : 1;
            const newVal = current ? 0 : 1;

            ctx.db.run(`INSERT INTO group_settings (chat_id, welcome_enabled) VALUES (?, ?) 
                        ON CONFLICT(chat_id) DO UPDATE SET welcome_enabled=excluded.welcome_enabled`, 
                        [ctx.chat.id, newVal], (err) => {
                if (err) return ctx.reply('Error saving settings.');
                ctx.reply(`Welcome Message turned ${newVal ? 'ON' : 'OFF'}.`);
            });
        });
    });
}

module.exports = { setupSettings };
