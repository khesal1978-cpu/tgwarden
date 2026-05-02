function setupWelcome(bot) {
    bot.on('new_chat_members', async (ctx) => {
        try {
            const row = await ctx.dbAsync.get('SELECT welcome_message, welcome_enabled FROM group_settings WHERE chat_id = ?', [ctx.chat.id]);
            const settings = row || { welcome_message: 'Welcome to the group, {name}!', welcome_enabled: 1 };
            
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
                            continue; // Skip welcome message
                        }
                    }
                } catch(e) {
                    console.error("Failed to check bio:", e);
                }

                if (settings.welcome_enabled) {
                    const name = member.first_name || 'Member';
                    const message = settings.welcome_message.replace('{name}', name);
                    ctx.reply(message);
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
