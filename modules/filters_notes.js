async function checkAdmin(ctx) {
    if(ctx.chat.type === 'private') return false;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

function setupFiltersAndNotes(bot) {
    // FILTERS
    bot.command('filter', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        // Format: /filter keyword response
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 2) return ctx.reply('Format: /filter <keyword> <response>');
        
        const keyword = args[0].toLowerCase();
        const response = args.slice(1).join(' ');

        try {
            await ctx.dbAsync.run(`INSERT INTO group_filters (chat_id, keyword, response) VALUES (?, ?, ?) ON CONFLICT(chat_id, keyword) DO UPDATE SET response=excluded.response`, [ctx.chat.id, keyword, response]);
            ctx.reply(`Filter set for '${keyword}'.`);
        } catch(e) {
            ctx.reply('Failed to set filter.');
        }
    });

    bot.command('stop', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Format: /stop <keyword>');
        
        const keyword = args[0].toLowerCase();
        try {
            await ctx.dbAsync.run(`DELETE FROM group_filters WHERE chat_id = ? AND keyword = ?`, [ctx.chat.id, keyword]);
            ctx.reply(`Filter '${keyword}' removed.`);
        } catch(e) {
            ctx.reply('Failed to remove filter.');
        }
    });

    // NOTES
    bot.command('save', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        // Format: /save note_name content
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 2) return ctx.reply('Format: /save <notename> <content>');
        
        const notename = args[0].toLowerCase();
        const content = args.slice(1).join(' ');

        try {
            await ctx.dbAsync.run(`INSERT INTO group_notes (chat_id, note_name, content) VALUES (?, ?, ?) ON CONFLICT(chat_id, note_name) DO UPDATE SET content=excluded.content`, [ctx.chat.id, notename, content]);
            ctx.reply(`Note '${notename}' saved. Get it with #${notename}`);
        } catch(e) {
            ctx.reply('Failed to save note.');
        }
    });

    bot.command('clear', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Format: /clear <notename>');
        
        const notename = args[0].toLowerCase();
        try {
            await ctx.dbAsync.run(`DELETE FROM group_notes WHERE chat_id = ? AND note_name = ?`, [ctx.chat.id, notename]);
            ctx.reply(`Note '${notename}' cleared.`);
        } catch(e) {
            ctx.reply('Failed to clear note.');
        }
    });

    // Process filters and notes
    bot.on('text', async (ctx, next) => {
        if (ctx.chat.type === 'private') return next();
        
        const text = ctx.message.text;
        if (!text) return next();

        // Check for notes (#notename)
        if (text.startsWith('#')) {
            const notename = text.substring(1).split(' ')[0].toLowerCase();
            try {
                const note = await ctx.dbAsync.get(`SELECT content FROM group_notes WHERE chat_id = ? AND note_name = ?`, [ctx.chat.id, notename]);
                if (note) {
                    await ctx.reply(note.content, { reply_to_message_id: ctx.message.message_id });
                }
            } catch(e) {}
        }

        // Check for filters (exact word match)
        const words = text.toLowerCase().split(/\s+/);
        try {
            const filters = await ctx.dbAsync.all(`SELECT keyword, response FROM group_filters WHERE chat_id = ?`, [ctx.chat.id]);
            for (const filter of filters) {
                if (words.includes(filter.keyword)) {
                    await ctx.reply(filter.response, { reply_to_message_id: ctx.message.message_id });
                    break; // Only trigger one filter per message
                }
            }
        } catch(e) {}

        return next();
    });
}

module.exports = { setupFiltersAndNotes };
