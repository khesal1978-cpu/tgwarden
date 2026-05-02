async function checkAdmin(ctx) {
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

// Helper to parse time strings like '2h', '30m', '1d' to seconds
function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)([hmd])$/);
    if (!match) return 0;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    return 0;
}

function setupModeration(bot) {
    const commands = ['ban', 'sban', 'tban', 'kick', 'mute', 'smute', 'tmute', 'warn', 'unban', 'unmute', 'report'];

    commands.forEach(cmd => {
        bot.command(cmd, async (ctx) => {
            if (ctx.chat.type === 'private') return;

            // Report command is for everyone
            if (cmd === 'report') {
                const targetMessage = ctx.message.reply_to_message;
                if (!targetMessage) return ctx.reply('Reply to a message to report it to admins.');
                // In a real bot, we'd pin it or send to a log channel. For now, tag admins.
                const admins = await ctx.getChatAdministrators();
                const adminTags = admins.map(a => `[${a.user.first_name}](tg://user?id=${a.user.id})`).join(' ');
                return ctx.reply(`Message reported to admins! ${adminTags}`, { parse_mode: 'Markdown' });
            }

            if (!(await checkAdmin(ctx))) return ctx.reply('Admin only command.');

            const targetMessage = ctx.message.reply_to_message;
            if (!targetMessage) return ctx.reply(`Please reply to a user's message to ${cmd} them.`);
            
            const targetId = targetMessage.from.id;
            const targetName = targetMessage.from.first_name;

            try {
                if (cmd === 'ban' || cmd === 'sban') {
                    await ctx.banChatMember(targetId);
                    if (cmd !== 'sban') ctx.reply(`Banned ${targetName}.`);
                } 
                else if (cmd === 'tban') {
                    const args = ctx.message.text.split(' ').slice(1);
                    const seconds = parseTime(args[0] || '1d');
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    await ctx.banChatMember(targetId, untilDate);
                    ctx.reply(`Temporarily banned ${targetName} for ${args[0] || '1d'}.`);
                }
                else if (cmd === 'kick') {
                    await ctx.banChatMember(targetId);
                    await ctx.unbanChatMember(targetId);
                    ctx.reply(`Kicked ${targetName}.`);
                }
                else if (cmd === 'mute' || cmd === 'smute') {
                    await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: false } });
                    if (cmd !== 'smute') ctx.reply(`Muted ${targetName}.`);
                }
                else if (cmd === 'tmute') {
                    const args = ctx.message.text.split(' ').slice(1);
                    const seconds = parseTime(args[0] || '1h');
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: false }, until_date: untilDate });
                    ctx.reply(`Temporarily muted ${targetName} for ${args[0] || '1h'}.`);
                }
                else if (cmd === 'unban') {
                    await ctx.unbanChatMember(targetId);
                    ctx.reply(`Unbanned ${targetName}.`);
                }
                else if (cmd === 'unmute') {
                    await ctx.restrictChatMember(targetId, {
                        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }
                    });
                    ctx.reply(`Unmuted ${targetName}.`);
                }
                else if (cmd === 'warn') {
                    const row = await ctx.dbAsync.get('SELECT count FROM warnings WHERE user_id = ? AND chat_id = ?', [targetId, ctx.chat.id]);
                    let count = row ? row.count + 1 : 1;

                    if (row) {
                        await ctx.dbAsync.run('UPDATE warnings SET count = ? WHERE user_id = ? AND chat_id = ?', [count, targetId, ctx.chat.id]);
                    } else {
                        await ctx.dbAsync.run('INSERT INTO warnings (user_id, chat_id, count) VALUES (?, ?, ?)', [targetId, ctx.chat.id, count]);
                    }

                    if (count >= 3) {
                        await ctx.banChatMember(targetId);
                        ctx.reply(`${targetName} reached 3 warnings and was banned.`);
                        await ctx.dbAsync.run('DELETE FROM warnings WHERE user_id = ? AND chat_id = ?', [targetId, ctx.chat.id]);
                    } else {
                        ctx.reply(`User ${targetName} warned. (${count}/3)`);
                    }
                }
            } catch(e) {
                console.error(`Failed command ${cmd}`, e);
                ctx.reply(`Failed to execute ${cmd}. Ensure I have admin rights.`);
            }
        });
    });
}

module.exports = { setupModeration };
