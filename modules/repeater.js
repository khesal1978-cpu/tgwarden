async function checkAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2];
    
    if (unit === 's') return val * 1000;
    if (unit === 'm') return val * 60000;
    if (unit === 'h') return val * 3600000;
    if (unit === 'd') return val * 86400000;
    return null;
}

const activeIntervals = {};

function setupRepeater(bot) {
    // Start existing repeats from the database on bot boot
    setTimeout(async () => {
        try {
            const rows = await bot.context.dbAsync.all('SELECT * FROM group_repeats');
            for (const row of rows) {
                activeIntervals[row.chat_id] = setInterval(() => {
                    bot.telegram.sendMessage(row.chat_id, row.message).catch(err => {
                        console.log(`Failed to send repeating message to ${row.chat_id}:`, err.message);
                    });
                }, row.interval_ms);
            }
            console.log(`[Repeater] Restored ${rows.length} repeating messages from database.`);
        } catch (e) {
            console.error('Error loading repeats:', e);
        }
    }, 2000);

    bot.command('repeat', async (ctx) => {
        if (!(await checkAdmin(ctx))) return ctx.reply('Only admins can set repeating messages.');
        if (ctx.chat.type === 'private') return ctx.reply('This command can only be used in groups.');

        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('Format: /repeat <time> <message>\nExample: /repeat 1h Read our rules!');

        const timeStr = args[1].toLowerCase();
        const interval_ms = parseTime(timeStr);
        if (!interval_ms) return ctx.reply('Invalid time format. Use s, m, h, or d (e.g., 30m, 2h).');

        // Prevent spammy limits (minimum 5 minutes)
        if (interval_ms < 300000) {
            return ctx.reply('To prevent spam, the minimum repeat interval is 5 minutes (5m).');
        }

        const message = args.slice(2).join(' ');

        try {
            // Save to DB
            await ctx.dbAsync.run(`INSERT INTO group_repeats (chat_id, interval_ms, message) VALUES (?, ?, ?) 
                        ON CONFLICT(chat_id) DO UPDATE SET interval_ms=excluded.interval_ms, message=excluded.message`, 
                        [ctx.chat.id, interval_ms, message]);
            
            // Clear existing interval if there is one
            if (activeIntervals[ctx.chat.id]) {
                clearInterval(activeIntervals[ctx.chat.id]);
            }

            // Start new interval
            activeIntervals[ctx.chat.id] = setInterval(() => {
                ctx.telegram.sendMessage(ctx.chat.id, message).catch(err => {
                    console.log(`Failed to send repeating message to ${ctx.chat.id}:`, err.message);
                });
            }, interval_ms);

            ctx.reply(`✅ Repeating message scheduled. It will be sent every ${timeStr}.`);

        } catch (e) {
            ctx.reply('Error saving recurring message.');
            console.error(e);
        }
    });

    bot.command('stoprepeat', async (ctx) => {
        if (!(await checkAdmin(ctx))) return ctx.reply('Only admins can stop repeating messages.');
        if (ctx.chat.type === 'private') return ctx.reply('This command can only be used in groups.');

        try {
            await ctx.dbAsync.run('DELETE FROM group_repeats WHERE chat_id = ?', [ctx.chat.id]);
            
            if (activeIntervals[ctx.chat.id]) {
                clearInterval(activeIntervals[ctx.chat.id]);
                delete activeIntervals[ctx.chat.id];
            }
            
            ctx.reply('⏹️ Repeating message stopped.');
        } catch (e) {
            ctx.reply('Error stopping recurring message.');
            console.error(e);
        }
    });
}

module.exports = { setupRepeater };
