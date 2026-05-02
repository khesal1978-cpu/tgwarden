function setupWelcome(bot) {
    bot.on('new_chat_members', async (ctx) => {
        try {
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
            }
            // Delete the "User joined" service message from the chat
            await ctx.deleteMessage().catch(()=>{});
        } catch(e) {
            console.error(e);
        }
    });
}

module.exports = { setupWelcome };
