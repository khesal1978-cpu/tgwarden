require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const { db, dbAsync } = require('./database');

// Import modules
const { setupModeration } = require('./modules/moderation');
const { setupAntiSpam } = require('./modules/antispam');
const { setupWelcome } = require('./modules/welcome');
const { setupSettings } = require('./modules/settings');
const { setupLocks } = require('./modules/locks');
const { setupRules } = require('./modules/rules');
const { setupFiltersAndNotes } = require('./modules/filters_notes');
const { setupAutoDelete } = require('./modules/autodelete');

// Initialize the bot
const token = process.env.BOT_TOKEN;
if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.error('ERROR: Please set your BOT_TOKEN in the .env file!');
    process.exit(1);
}

const bot = new Telegraf(token);

// Middleware to expose DB to ctx and auto-delete bot messages after 16s
bot.use((ctx, next) => {
    ctx.db = db;
    ctx.dbAsync = dbAsync;

    // Intercept replies to auto-delete
    if (ctx.reply) {
        const originalReply = ctx.reply.bind(ctx);
        ctx.reply = async function (...args) {
            try {
                const msg = await originalReply(...args);
                const delay = ctx.state.deleteDelay || 16000;
                setTimeout(() => {
                    if (msg && msg.message_id) {
                        ctx.deleteMessage(msg.message_id).catch(() => {});
                    }
                }, delay);
                return msg;
            } catch(e) { throw e; }
        };
    }

    if (ctx.replyWithMarkdown) {
        const originalReplyMd = ctx.replyWithMarkdown.bind(ctx);
        ctx.replyWithMarkdown = async function (...args) {
            try {
                const msg = await originalReplyMd(...args);
                const delay = ctx.state.deleteDelay || 16000;
                setTimeout(() => {
                    if (msg && msg.message_id) {
                        ctx.deleteMessage(msg.message_id).catch(() => {});
                    }
                }, delay);
                return msg;
            } catch(e) { throw e; }
        };
    }

    return next();
});

// Setup modules
setupSettings(bot);
setupRules(bot);
setupFiltersAndNotes(bot);
setupModeration(bot);
setupWelcome(bot);
setupLocks(bot);
setupAutoDelete(bot);
setupAntiSpam(bot); // Catch-all middleware

bot.start((ctx) => {
    const text = `🛡️ **Welcome to TG Warden!** 🛡️

I am an elite, enterprise-grade Telegram Group Manager designed to keep your communities absolutely spotless.

**✨ Core Features:**
• **100% Automatic Security:** Instantly deletes links, hashtags, and bot commands from non-admins.
• **Bio-Link Bans:** Automatically bans any user joining with a promotional link in their bio.
• **Promotional Auto-Kick:** Detects spam words (buy/sell), issues warnings, and auto-kicks at 3 warnings.
• **Media Locks:** Granular control to lock photos, stickers, voices, and more.
• **Ghost Sweeper:** Silently removes annoying "User joined" or "Message pinned" service notifications.
• **Ephemeral Mode:** Set a global timer (e.g. \`/setdelay 5m\`) to automatically wipe all chat history.
• **Custom Auto-Replies:** Create custom triggers and interactive welcome messages.

**🚀 How to use:**
1. Add me to your group.
2. Promote me to **Administrator** (Ensure I have permissions to Delete Messages and Ban Users).
3. Type \`/fuck\` in your group to open the Master Control Panel!`;

    ctx.reply(text, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '➕ Add TG Warden to your Group', url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }]]
        }
    });
});

// Helper to check admin status for the /fuck command
async function isUserAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (e) {
        return false;
    }
}

const menus = {
    main: `⚡ **Bot Control Panel** ⚡\n\nSelect a category below to view commands:`,
    mod: `🛡️ **Moderation Commands**\n\n/ban - Perma ban\n/tban 1d - Temp ban\n/sban - Silent ban\n/kick - Kick user\n/mute - Perma mute\n/tmute 2h - Temp mute\n/smute - Silent mute\n/warn - Issue warning\n/unban - Unban user\n/unmute - Unmute user`,
    locks: `🔒 **Media Locks**\n\n/lock audio | /unlock audio\n/lock voice | /unlock voice\n/lock video | /unlock video\n/lock photo | /unlock photo\n/lock document | /unlock document\n/lock sticker | /unlock sticker\n/lock gif | /unlock gif\n/lock forward | /unlock forward\n/lock url | /unlock url`,
    settings: `📝 **Settings & Auto-Replies**\n\n/filter <word> <reply> - Add trigger\n/stop <word> - Remove trigger\n/save <name> <text> - Add note\n/clear <name> - Remove note\n\n/settings - View configuration\n/setwelcome <text> || <Button Name> | <URL> - Set custom greeting (button is optional)\n/togglewelcome - Welcome on/off\n/blacklist <word> - Auto-delete word\n\n🛡️ **100% Automatic Security (Always ON)**\n• No Links (HTTP, Telegram, etc.)\n• No Hashtags (#)\n• No Bot Commands (for regular members)\n• No Bio-Links (Auto-Ban on Join)\n• No Service Msgs (Joined, left, pinned)\n• No Promotional Words (buy, sell, discount) -> Auto-Warning & Kick at 3`,
    autodelete: `🧹 **Auto-Deleter**\n\n/setdelay 5m - Wipe chat every 5m\n/stopdelay - Disable wipe`
};

bot.command('fuck', async (ctx) => {
    if (!(await isUserAdmin(ctx))) return ctx.reply('Admins only.');
    ctx.state.deleteDelay = 120000; // 2 minutes
    
    ctx.reply(menus.main, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Moderation', callback_data: 'menu_mod' }, { text: '🔒 Locks', callback_data: 'menu_locks' }],
                [{ text: '📝 Settings & Rules', callback_data: 'menu_settings' }],
                [{ text: '🧹 Auto-Deleter', callback_data: 'menu_autodelete' }]
            ]
        }
    });
});

bot.action(/menu_(.+)/, async (ctx) => {
    if (!(await isUserAdmin(ctx))) return ctx.answerCbQuery('Admins only.', { show_alert: true });

    const menu = ctx.match[1];
    
    try {
        if (menu === 'main') {
            await ctx.editMessageText(menus.main, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛡️ Moderation', callback_data: 'menu_mod' }, { text: '🔒 Locks', callback_data: 'menu_locks' }],
                        [{ text: '📝 Settings & Rules', callback_data: 'menu_settings' }],
                        [{ text: '🧹 Auto-Deleter', callback_data: 'menu_autodelete' }]
                    ]
                }
            });
        } else if (menus[menu]) {
            await ctx.editMessageText(menus[menu], {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'menu_main' }]]
                }
            });
        }
        ctx.answerCbQuery();
    } catch (e) {
        // Ignore message not modified errors
        ctx.answerCbQuery().catch(()=>{});
    }
});

bot.help((ctx) => {
    ctx.reply(
        '**Bot Commands:**\n' +
        '/ban, /sban, /tban <time> - Ban users\n' +
        '/mute, /smute, /tmute <time> - Mute users\n' +
        '/kick, /warn, /report - Moderation actions\n' +
        '/lock <type>, /unlock <type> - Manage media locks\n' +
        '/setrules, /rules - Manage rules\n' +
        '/filter <word> <reply>, /stop <word> - Auto-replies\n' +
        '/save <name> <text>, /clear <name> - Custom notes\n' +
        '/blacklist <word>, /unblacklist <word> - Delete messages with word\n' +
        '/setdelay <time>, /stopdelay - Auto-delete all group messages\n' +
        '/settings - View/manage basic group settings',
        { parse_mode: 'Markdown' }
    );
});

// Start polling
bot.launch().then(() => {
    console.log('Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ==========================================
// RENDER.COM KEEP-ALIVE SERVER & CRONJOB
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('TG Warden is running and protecting your groups!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Keep-alive web server listening on port ${PORT}`);
});

// Run a cron job every 14 minutes to ping its own URL and keep Render awake
cron.schedule('*/14 * * * *', async () => {
    const url = process.env.RENDER_EXTERNAL_URL; // Render provides this automatically
    if (url) {
        try {
            await axios.get(url);
            console.log(`[Cron] Pinged ${url} successfully to keep bot awake.`);
        } catch (e) {
            console.error(`[Cron] Ping failed:`, e.message);
        }
    } else {
        console.log('[Cron] No RENDER_EXTERNAL_URL found. Skipping self-ping.');
    }
});
