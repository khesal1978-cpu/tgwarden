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
                        try {
                            const media = JSON.parse(settings.welcome_photo_id);
                            if (media.type === 'photo') msg = await bot.telegram.sendPhoto(ctx.chat.id, media.file_id, { caption: text }).catch(e => console.error(e));
                            else if (media.type === 'sticker') {
                                msg = await bot.telegram.sendSticker(ctx.chat.id, media.file_id).catch(e => console.error(e));
                                // Stickers can't have captions natively, so if there's custom text, send it separately
                                if (settings.welcome_message !== 'Welcome {name}!' && text.trim() !== '') {
                                    const textMsg = await bot.telegram.sendMessage(ctx.chat.id, text).catch(e => console.error(e));
                                    if (textMsg && textMsg.message_id) {
                                        setTimeout(() => { ctx.deleteMessage(textMsg.message_id).catch(()=>{}); }, 16000);
                                    }
                                }
                            }
                            else if (media.type === 'video') msg = await bot.telegram.sendVideo(ctx.chat.id, media.file_id, { caption: text }).catch(e => console.error(e));
                            else if (media.type === 'animation') msg = await bot.telegram.sendAnimation(ctx.chat.id, media.file_id, { caption: text }).catch(e => console.error(e));
                        } catch(e) {
                            // Legacy: if it's not JSON, it was saved as a raw photo ID previously
                            msg = await bot.telegram.sendPhoto(ctx.chat.id, settings.welcome_photo_id, { caption: text }).catch(err => console.error("Legacy photo error:", err));
                        }
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
