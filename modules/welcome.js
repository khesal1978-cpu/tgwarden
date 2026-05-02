function setupWelcome(bot) {
    bot.on('new_chat_members', async (ctx) => {
        try {
            const row = await ctx.dbAsync.get('SELECT welcome_message, welcome_enabled FROM group_settings WHERE chat_id = ?', [ctx.chat.id]);
            const settings = row || { welcome_message: 'Welcome to the group, {name}!', welcome_enabled: 0 };

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
                    let rawMessage = settings.welcome_message.replace(/{name}/g, name);
                    
                    let text = rawMessage;
                    let replyMarkup = {};

                    // Parse inline button syntax: Text || Button Name | URL
                    if (rawMessage.includes('||')) {
                        const parts = rawMessage.split('||');
                        text = parts[0].trim();
                        const btnData = parts[1].trim();
                        
                        if (btnData.includes('|')) {
                            const btnParts = btnData.split('|');
                            const btnName = btnParts[0].trim();
                            const btnUrl = btnParts.slice(1).join('|').trim(); // Join rest in case URL has |
                            
                            if (btnName && btnUrl) {
                                replyMarkup = {
                                    inline_keyboard: [[{ text: btnName, url: btnUrl }]]
                                };
                            }
                        }
                    }

                    ctx.reply(text, { reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined });
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
