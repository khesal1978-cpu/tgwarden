// Anti-spam module with Blacklist support
function setupAntiSpam(bot) {
    // Automatically delete all service messages (left, pin, photo change, etc)
    const serviceEvents = [
        'left_chat_member', 
        'new_chat_title', 
        'new_chat_photo', 
        'delete_chat_photo', 
        'pinned_message'
    ];
    bot.on(serviceEvents, async (ctx, next) => {
        await ctx.deleteMessage().catch(()=>{});
        return next();
    });

    bot.command('blacklist', async (ctx) => {
        // Admin check
        try {
            const member = await ctx.getChatMember(ctx.from.id);
            if(member.status !== 'creator' && member.status !== 'administrator') return;
        } catch(e) { return; }

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Format: /blacklist <word>');
        const word = args[0].toLowerCase();

        try {
            await ctx.dbAsync.run(`INSERT INTO blacklists (chat_id, word) VALUES (?, ?) ON CONFLICT DO NOTHING`, [ctx.chat.id, word]);
            ctx.reply(`Added '${word}' to the blacklist.`);
        } catch(e) { ctx.reply('Failed to add to blacklist.'); }
    });

    bot.command('unblacklist', async (ctx) => {
        try {
            const member = await ctx.getChatMember(ctx.from.id);
            if(member.status !== 'creator' && member.status !== 'administrator') return;
        } catch(e) { return; }

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Format: /unblacklist <word>');
        const word = args[0].toLowerCase();

        try {
            await ctx.dbAsync.run(`DELETE FROM blacklists WHERE chat_id = ? AND word = ?`, [ctx.chat.id, word]);
            ctx.reply(`Removed '${word}' from the blacklist.`);
        } catch(e) { ctx.reply('Failed to remove from blacklist.'); }
    });

    bot.on('message', async (ctx, next) => {
        if (ctx.chat.type === 'private') return next();

        let isAdmin = false;
        try {
            const member = await ctx.getChatMember(ctx.from.id);
            if (member.status === 'creator' || member.status === 'administrator') isAdmin = true;
        } catch (e) {}

        if (isAdmin) return next();

        try {
            let shouldDelete = false;

            const text = (ctx.message.text || ctx.message.caption || '').toLowerCase();

            // Automatic URL lock
            const linkPattern = /https?:\/\/[^\s]+|t\.me\/[^\s]+|\.com|\.org|\.net/gi;
            if (linkPattern.test(text)) shouldDelete = true;

            // No commands for members
            if (text.startsWith('/')) shouldDelete = true;

            // No hashtags for members
            if (text.includes('#')) shouldDelete = true;

            // Custom Blacklist
            if (!shouldDelete && text) {
                const blacklistedWords = await ctx.dbAsync.all(`SELECT word FROM blacklists WHERE chat_id = ?`, [ctx.chat.id]);
                for (const row of blacklistedWords) {
                    if (text.includes(row.word)) {
                        shouldDelete = true;
                        break;
                    }
                }
            }

            // Promotional Spam Detection (buy, sell, etc)
            let isPromo = false;
            const promoPattern = /\b(buy|sell|buying|selling|price|discount)\b/gi;
            if (promoPattern.test(text)) {
                shouldDelete = true;
                isPromo = true;
            }

            if (shouldDelete) {
                await ctx.deleteMessage().catch(()=>{});

                // Issue auto-warning if it was a promo
                if (isPromo) {
                    const targetId = ctx.from.id;
                    const targetName = ctx.from.first_name;
                    const chatId = ctx.chat.id;

                    const row = await ctx.dbAsync.get('SELECT count FROM warnings WHERE user_id = ? AND chat_id = ?', [targetId, chatId]);
                    let count = row ? row.count + 1 : 1;

                    if (row) {
                        await ctx.dbAsync.run('UPDATE warnings SET count = ? WHERE user_id = ? AND chat_id = ?', [count, targetId, chatId]);
                    } else {
                        await ctx.dbAsync.run('INSERT INTO warnings (user_id, chat_id, count) VALUES (?, ?, ?)', [targetId, chatId, count]);
                    }

                    if (count >= 3) {
                        // Kick the user (Ban and immediately unban)
                        await ctx.banChatMember(targetId);
                        await ctx.unbanChatMember(targetId);
                        ctx.reply(`🚫 ${targetName} was kicked for repeated promotional spam.`);
                        await ctx.dbAsync.run('DELETE FROM warnings WHERE user_id = ? AND chat_id = ?', [targetId, chatId]);
                    } else {
                        ctx.reply(`⚠️ Warning ${count}/3: ${targetName}, please do not promote items here.`);
                    }
                }
            } else {
                return next();
            }
        } catch(e) {
            return next();
        }
    });
}

module.exports = { setupAntiSpam };
