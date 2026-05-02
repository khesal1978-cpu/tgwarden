function setupWelcome(bot) {
    bot.on('new_chat_members', async (ctx) => {
        try {
            const row = await ctx.dbAsync.get('SELECT welcome_message, welcome_enabled, welcome_photo_id FROM group_settings WHERE chat_id = ?', [ctx.chat.id]);
            const settings = row || { welcome_message: 'Welcome to the group, {name}!', welcome_enabled: 0, welcome_photo_id: null };

            for (const member of ctx.message.new_chat_members) {
                if (member.is_bot) continue;

                // Bio link restriction check is ALWAYS ON automatically
                try {
                    const userChat = await ctx.telegram.getChat(member.id);
                    if (userChat.bio) {
                        const linkPattern = /https?:\/\/[^\s]+|t\.me\/[^\s]+|\.com|\.org|\.net|\.xyz/gi;
                        if (linkPattern.test(userChat.bio)) {
                            await ctx.banChatMember(member.id);
                            console.log(`Banned ${member.id} for having a link in their bio.`);
                            continue; // Skip further processing
                        }
                    }
                } catch(e) {
                    console.error("Failed to check bio:", e);
                }

                if (settings.welcome_enabled) {
                    const name = member.first_name || 'Member';
                    let text = settings.welcome_message.replace(/{name}/g, name);

                    let msg;
                    if (settings.welcome_photo_id) {
                        msg = await bot.telegram.sendPhoto(ctx.chat.id, settings.welcome_photo_id, { caption: text }).catch(e => console.error("Photo welcome error:", e));
                    } else {
                        msg = await bot.telegram.sendMessage(ctx.chat.id, text).catch(e => console.error("Text welcome error:", e));
                    }

                    // Auto-delete welcome message after 16 seconds
                    if (msg && msg.message_id) {
                        setTimeout(() => {
                            ctx.deleteMessage(msg.message_id).catch(()=>{});
                        }, 16000);
                    }
                }
            }
            // Delete the "User joined" service message from the chat
            await ctx.deleteMessage().catch(()=>{});
        } catch(e) {
            console.error(e);
        }
    });
}

module.exports = { setupWelcome };
