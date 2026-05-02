const { dbAsync } = require('../database');

async function checkAdmin(ctx) {
    if(ctx.chat.type === 'private') return false;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

// Helper to parse time strings like '5m', '10s', '1h' to seconds
function parseTimeToSeconds(timeStr) {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return -1;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    return -1;
}

function setupAutoDelete(bot) {
    bot.command('setdelay', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return ctx.reply('Please specify a delay. Example: /setdelay 5m, /setdelay 10s');
        
        const seconds = parseTimeToSeconds(args[0]);
        if (seconds <= 0) return ctx.reply('Invalid format. Use formats like 10s, 5m, 1h, 1d.');
        
        // Prevent setting a delay too short to avoid API limits (e.g., minimum 5 seconds)
        if (seconds < 5) return ctx.reply('Delay must be at least 5 seconds.');

        try {
            await ctx.dbAsync.run(
                `INSERT INTO group_autodelete (chat_id, delay_seconds) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET delay_seconds=excluded.delay_seconds`,
                [ctx.chat.id, seconds]
            );
            ctx.reply(`Auto-delete is enabled. All new messages will be deleted after ${args[0]}.`);
        } catch(e) {
            ctx.reply('Failed to set auto-delete delay.');
        }
    });

    bot.command('stopdelay', async (ctx) => {
        if (!(await checkAdmin(ctx))) return;

        try {
            await ctx.dbAsync.run(`DELETE FROM group_autodelete WHERE chat_id = ?`, [ctx.chat.id]);
            ctx.reply('Auto-delete is disabled. Messages will no longer be deleted automatically.');
        } catch(e) {
            ctx.reply('Failed to stop auto-delete delay.');
        }
    });

    // We use a separate interceptor that doesn't block the chain so other modules still process it
    bot.use(async (ctx, next) => {
        // Only run for groups
        if (ctx.chat && ctx.chat.type !== 'private' && ctx.message && ctx.message.message_id) {
            try {
                const setting = await ctx.dbAsync.get(`SELECT delay_seconds FROM group_autodelete WHERE chat_id = ?`, [ctx.chat.id]);
                if (setting && setting.delay_seconds > 0) {
                    const deleteAt = Date.now() + (setting.delay_seconds * 1000);
                    await ctx.dbAsync.run(
                        `INSERT INTO messages_to_delete (chat_id, message_id, delete_at) VALUES (?, ?, ?)`,
                        [ctx.chat.id, ctx.message.message_id, deleteAt]
                    );
                }
            } catch (e) {
                console.error("Failed to queue message for auto-deletion:", e);
            }
        }
        return next();
    });

    // The polling loop to delete messages
    setInterval(async () => {
        const now = Date.now();
        try {
            // Get messages that are past their deletion time
            const messages = await dbAsync.all(`SELECT id, chat_id, message_id FROM messages_to_delete WHERE delete_at <= ? LIMIT 50`, [now]);
            
            for (const msg of messages) {
                try {
                    await bot.telegram.deleteMessage(msg.chat_id, msg.message_id);
                } catch(e) {
                    // Ignore errors if the message was already deleted
                    if (e.response && e.response.error_code === 400 && e.response.description.includes('message to delete not found')) {
                        // All good, already gone
                    } else {
                        console.error("Error auto-deleting message:", e);
                    }
                }
                // Delete from DB regardless of success or failure to avoid infinite loops on failed deletes
                await dbAsync.run(`DELETE FROM messages_to_delete WHERE id = ?`, [msg.id]);
            }
        } catch(e) {
            console.error("Auto-delete loop error:", e);
        }
    }, 5000); // Check every 5 seconds
}

module.exports = { setupAutoDelete };
