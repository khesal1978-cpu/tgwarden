const { dbAsync } = require('../database');

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

async function sendRepeatingMessage(bot, chat_id, message_data) {
    try {
        const data = JSON.parse(message_data);
        const options = { 
            reply_markup: data.reply_markup 
        };
        
        let msg = null;
        if (data.type === 'text') {
            options.entities = data.entities;
            msg = await bot.telegram.sendMessage(chat_id, data.content, options);
        } else {
            options.caption = data.caption;
            options.caption_entities = data.caption_entities;

            if (data.type === 'photo') msg = await bot.telegram.sendPhoto(chat_id, data.file_id, options);
            else if (data.type === 'video') msg = await bot.telegram.sendVideo(chat_id, data.file_id, options);
            else if (data.type === 'animation') msg = await bot.telegram.sendAnimation(chat_id, data.file_id, options);
            else if (data.type === 'sticker') msg = await bot.telegram.sendSticker(chat_id, data.file_id, { reply_markup: data.reply_markup });
            else if (data.type === 'document') msg = await bot.telegram.sendDocument(chat_id, data.file_id, options);
            else if (data.type === 'audio') msg = await bot.telegram.sendAudio(chat_id, data.file_id, options);
            else if (data.type === 'voice') msg = await bot.telegram.sendVoice(chat_id, data.file_id, options);
        }

        // Auto-delete the repeated message after exactly 10 minutes (600,000 ms)
        if (msg && msg.message_id) {
            setTimeout(() => {
                bot.telegram.deleteMessage(chat_id, msg.message_id).catch(()=>{});
            }, 600000);
        }
    } catch (e) {
        console.log(`Failed to send repeating message to ${chat_id}:`, e.message);
    }
}

function setupRepeater(bot) {
    // Start existing repeats from the database on bot boot
    setTimeout(async () => {
        try {
            const rows = await dbAsync.all('SELECT * FROM group_repeats');
            for (const row of rows) {
                if (!row.message_data) continue;
                activeIntervals[row.chat_id] = setInterval(() => {
                    sendRepeatingMessage(bot, row.chat_id, row.message_data);
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
        if (args.length < 2) return ctx.reply('Format: Reply to a message/media with /repeat <time>\nExample: /repeat 30m');

        const timeStr = args[1].toLowerCase();
        const interval_ms = parseTime(timeStr);
        if (!interval_ms) return ctx.reply('Invalid time format. Use s, m, h, or d (e.g., 30m, 2h).');

        // Prevent spammy limits (minimum 5 minutes)
        if (interval_ms < 300000) {
            return ctx.reply('To prevent spam, the minimum repeat interval is 5 minutes (5m).');
        }

        let msgData = null;

        // If they replied to a message, parse the media
        if (ctx.message.reply_to_message) {
            const rm = ctx.message.reply_to_message;
            if (rm.text) msgData = { type: 'text', content: rm.text, entities: rm.entities };
            else if (rm.photo) msgData = { type: 'photo', file_id: rm.photo[rm.photo.length-1].file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            else if (rm.video) msgData = { type: 'video', file_id: rm.video.file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            else if (rm.animation) msgData = { type: 'animation', file_id: rm.animation.file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            else if (rm.sticker) msgData = { type: 'sticker', file_id: rm.sticker.file_id };
            else if (rm.document) msgData = { type: 'document', file_id: rm.document.file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            else if (rm.audio) msgData = { type: 'audio', file_id: rm.audio.file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            else if (rm.voice) msgData = { type: 'voice', file_id: rm.voice.file_id, caption: rm.caption, caption_entities: rm.caption_entities };
            
            // Preserve inline keyboards if the original message had them
            if (rm.reply_markup) {
                msgData.reply_markup = rm.reply_markup;
            }
        } else {
            // No reply, just use the text provided after the time
            const textContent = args.slice(2).join(' ');
            if (!textContent) return ctx.reply('You must either reply to a message/media, or provide text: /repeat 1h Hello!');
            msgData = { type: 'text', content: textContent };
        }

        if (!msgData) return ctx.reply('Unsupported message type for repeating.');

        const messageDataString = JSON.stringify(msgData);

        try {
            // Save to DB
            await ctx.dbAsync.run(`INSERT INTO group_repeats (chat_id, interval_ms, message_data) VALUES (?, ?, ?) 
                        ON CONFLICT(chat_id) DO UPDATE SET interval_ms=excluded.interval_ms, message_data=excluded.message_data`, 
                        [ctx.chat.id, interval_ms, messageDataString]);
            
            // Clear existing interval if there is one
            if (activeIntervals[ctx.chat.id]) {
                clearInterval(activeIntervals[ctx.chat.id]);
            }

            // Start new interval
            activeIntervals[ctx.chat.id] = setInterval(() => {
                sendRepeatingMessage(bot, ctx.chat.id, messageDataString);
            }, interval_ms);

            ctx.reply(`✅ Repeating media/message scheduled. It will be sent every ${timeStr}.`);

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
