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
                welcome_enabled: 0,
                welcome_photo_id: null
            };

            const text = `⚙️ **Group Settings**\n\n` +
                         `🛡️ **Security Profile: ACTIVE (Auto)**\n` +
                         `*(Anti-Spam, Links, Bio-Links, Service Msgs, and Promo Checks are wiped automatically)*\n\n` +
                         `👋 **Welcome Message On:** ${settings.welcome_enabled ? '✅' : '❌'}\n` +
                         `📷 **Attached Media:** ${settings.welcome_photo_id ? '✅ Yes' : '❌ No'}\n` +
                         `**Message:** ${settings.welcome_message}\n\n` +
                         `*To change, use /setwelcome or /togglewelcome*`;

            ctx.replyWithMarkdown(text);
        });
    });

    bot.command('setwelcome', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const msg = ctx.message.text.split(' ').slice(1).join(' ');
        
        let media_data = null;
        if (ctx.message.reply_to_message) {
            const rm = ctx.message.reply_to_message;
            if (rm.photo) media_data = JSON.stringify({ type: 'photo', file_id: rm.photo[rm.photo.length - 1].file_id });
            else if (rm.sticker) media_data = JSON.stringify({ type: 'sticker', file_id: rm.sticker.file_id });
            else if (rm.video) media_data = JSON.stringify({ type: 'video', file_id: rm.video.file_id });
            else if (rm.animation) media_data = JSON.stringify({ type: 'animation', file_id: rm.animation.file_id });
        }

        if (!msg && !media_data) return ctx.reply('Format: /setwelcome Hello {name}!\n(You can also reply to a photo/sticker/gif with /setwelcome to attach it!)');

        const textToSave = msg || 'Welcome {name}!';

        ctx.db.run(`INSERT INTO group_settings (chat_id, welcome_message, welcome_photo_id) VALUES (?, ?, ?) 
                    ON CONFLICT(chat_id) DO UPDATE SET welcome_message=excluded.welcome_message, welcome_photo_id=excluded.welcome_photo_id`, 
                    [ctx.chat.id, textToSave, media_data], (err) => {
            if (err) return ctx.reply('Error saving settings.');
            ctx.reply('Welcome message updated! Turn it on with /togglewelcome if it is off.');
        });
    });

    bot.command('togglewelcome', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        
        ctx.db.get(`SELECT welcome_enabled FROM group_settings WHERE chat_id = ?`, [ctx.chat.id], (err, row) => {
            const current = row ? row.welcome_enabled : 0;
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
