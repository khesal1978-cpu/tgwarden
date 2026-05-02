async function checkAdmin(ctx) {
    if(ctx.chat.type === 'private') return false;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

function setupLocks(bot) {
    const validLocks = ['audio', 'voice', 'video', 'photo', 'document', 'sticker', 'gif', 'contact', 'location', 'forward', 'url', 'bot'];

    // Lock command
    bot.command('lock', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply(`Please specify what to lock. Valid types: ${validLocks.join(', ')}`);
        
        const type = args[0].toLowerCase();
        if (!validLocks.includes(type)) return ctx.reply(`Invalid lock type. Valid types: ${validLocks.join(', ')}`);

        try {
            await ctx.dbAsync.run(`INSERT INTO group_locks (chat_id, lock_type) VALUES (?, ?) ON CONFLICT DO NOTHING`, [ctx.chat.id, type]);
            ctx.reply(`Locked ${type}.`);
        } catch(e) {
            ctx.reply('Failed to set lock.');
        }
    });

    // Unlock command
    bot.command('unlock', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Please specify what to unlock.');
        
        const type = args[0].toLowerCase();
        
        try {
            await ctx.dbAsync.run(`DELETE FROM group_locks WHERE chat_id = ? AND lock_type = ?`, [ctx.chat.id, type]);
            ctx.reply(`Unlocked ${type}.`);
        } catch(e) {
            ctx.reply('Failed to unlock.');
        }
    });

    // Middleware to intercept locked messages
    bot.on('message', async (ctx, next) => {
        if (ctx.chat.type === 'private') return next();
        if (await checkAdmin(ctx)) return next(); // Admins bypass locks

        try {
            const locks = await ctx.dbAsync.all(`SELECT lock_type FROM group_locks WHERE chat_id = ?`, [ctx.chat.id]);
            const activeLocks = locks.map(l => l.lock_type);
            
            let shouldDelete = false;

            if (activeLocks.includes('audio') && ctx.message.audio) shouldDelete = true;
            if (activeLocks.includes('voice') && ctx.message.voice) shouldDelete = true;
            if (activeLocks.includes('video') && ctx.message.video) shouldDelete = true;
            if (activeLocks.includes('photo') && ctx.message.photo) shouldDelete = true;
            if (activeLocks.includes('document') && ctx.message.document) shouldDelete = true;
            if (activeLocks.includes('sticker') && ctx.message.sticker) shouldDelete = true;
            if (activeLocks.includes('gif') && ctx.message.animation) shouldDelete = true;
            if (activeLocks.includes('contact') && ctx.message.contact) shouldDelete = true;
            if (activeLocks.includes('location') && ctx.message.location) shouldDelete = true;
            if (activeLocks.includes('forward') && ctx.message.forward_date) shouldDelete = true;
            
            // Note: url and bot locks might be handled in antispam.js to avoid duplication,
            // but we can check here too.
            const text = ctx.message.text || ctx.message.caption || '';
            if (activeLocks.includes('url') && /https?:\/\/[^\s]+/.test(text)) shouldDelete = true;

            if (shouldDelete) {
                try {
                    await ctx.deleteMessage();
                } catch(e) { /* ignore */ }
            } else {
                return next();
            }
        } catch(e) {
            return next();
        }
    });
}

module.exports = { setupLocks };
