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
                if (!targetMessage) return ctx.reply('⚠️ Please **reply** to the message you want to report.', { parse_mode: 'Markdown' });
                
                try {
                    const admins = await ctx.getChatAdministrators();
                    const adminTags = admins.map(a => `[${a.user.first_name}](tg://user?id=${a.user.id})`).join(' ');
                    return ctx.reply(`🚨 Message reported to admins! ${adminTags}`, { parse_mode: 'Markdown' });
                } catch(e) {
                    return ctx.reply('Failed to fetch admins for report.');
                }
            }

            if (!(await checkAdmin(ctx))) return ctx.reply('🛑 This is an Admin-only command.');

            const targetMessage = ctx.message.reply_to_message;
            if (!targetMessage) return ctx.reply(`⚠️ Please **reply** to the user's message to \`/${cmd}\` them.`, { parse_mode: 'Markdown' });
            
            const targetId = targetMessage.from.id;
            const targetName = targetMessage.from.first_name;
            const chatIdStr = ctx.chat.id.toString();
            const targetIdStr = targetId.toString();

            // Prevent moderating the bot itself
            if (targetId === ctx.botInfo.id) return ctx.reply('🤖 I cannot moderate myself!');

            try {
                // Prevent moderating other admins
                const targetMember = await ctx.getChatMember(targetId);
                if (targetMember.status === 'creator' || targetMember.status === 'administrator') {
                    return ctx.reply('🛡️ I cannot perform moderation actions on another Admin!');
                }

                if (cmd === 'ban' || cmd === 'sban') {
                    await ctx.banChatMember(targetId);
                    if (cmd !== 'sban') ctx.reply(`🔨 Banned ${targetName}.`);
                } 
                else if (cmd === 'tban') {
                    const args = ctx.message.text.split(' ').slice(1);
                    const timeArg = args[0] || '1d';
                    const seconds = parseTime(timeArg);
                    if (seconds === 0) return ctx.reply('Invalid time format. Use something like `1d`, `2h`, `30m`.', {parse_mode: 'Markdown'});
                    
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    await ctx.banChatMember(targetId, untilDate);
                    ctx.reply(`⏳ Temporarily banned ${targetName} for ${timeArg}.`);
                }
                else if (cmd === 'kick') {
                    await ctx.banChatMember(targetId);
                    await ctx.unbanChatMember(targetId);
                    ctx.reply(`👢 Kicked ${targetName}.`);
                }
                else if (cmd === 'mute' || cmd === 'smute') {
                    await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: false } });
                    if (cmd !== 'smute') ctx.reply(`🔇 Muted ${targetName}.`);
                }
                else if (cmd === 'tmute') {
                    const args = ctx.message.text.split(' ').slice(1);
                    const timeArg = args[0] || '1h';
                    const seconds = parseTime(timeArg);
                    if (seconds === 0) return ctx.reply('Invalid time format. Use something like `1d`, `2h`, `30m`.', {parse_mode: 'Markdown'});
                    
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: false }, until_date: untilDate });
                    ctx.reply(`⏳ Temporarily muted ${targetName} for ${timeArg}.`);
                }
                else if (cmd === 'unban') {
                    await ctx.unbanChatMember(targetId);
                    ctx.reply(`✅ Unbanned ${targetName}.`);
                }
                else if (cmd === 'unmute') {
                    await ctx.restrictChatMember(targetId, {
                        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }
                    });
                    ctx.reply(`🔊 Unmuted ${targetName}.`);
                }
                else if (cmd === 'warn') {
                    const row = await ctx.dbAsync.get('SELECT count FROM warnings WHERE user_id = ? AND chat_id = ?', [targetIdStr, chatIdStr]);
                    let count = row ? row.count + 1 : 1;

                    if (row) {
                        await ctx.dbAsync.run('UPDATE warnings SET count = ? WHERE user_id = ? AND chat_id = ?', [count, targetIdStr, chatIdStr]);
                    } else {
                        await ctx.dbAsync.run('INSERT INTO warnings (user_id, chat_id, count) VALUES (?, ?, ?)', [targetIdStr, chatIdStr, count]);
                    }

                    if (count >= 3) {
                        await ctx.banChatMember(targetId);
                        ctx.reply(`🛑 ${targetName} reached 3 warnings and has been BANNED.`);
                        await ctx.dbAsync.run('DELETE FROM warnings WHERE user_id = ? AND chat_id = ?', [targetIdStr, chatIdStr]);
                    } else {
                        ctx.reply(`⚠️ User ${targetName} warned. (${count}/3)`);
                    }
                }
            } catch(e) {
                console.error(`Failed command ${cmd}`, e);
                // Provide actionable error messages
                if (e.response && e.response.description) {
                    if (e.response.description.includes('not enough rights')) {
                        ctx.reply(`❌ Failed to ${cmd}: I do not have permission to do this! Please ensure I am an Admin with Ban/Restrict rights.`);
                    } else {
                        ctx.reply(`❌ Telegram Error: ${e.response.description}`);
                    }
                } else {
                    ctx.reply(`❌ Failed to execute ${cmd}. Unexpected error occurred.`);
                }
            }
        });
    });
}

module.exports = { setupModeration };
