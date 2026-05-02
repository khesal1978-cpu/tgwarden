const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'bot.sqlite'), (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    // Existing tables
    db.run(`CREATE TABLE IF NOT EXISTS group_settings (
        chat_id TEXT PRIMARY KEY,
        welcome_message TEXT DEFAULT 'Welcome to the group!',
        anti_spam_links BOOLEAN DEFAULT 1,
        anti_spam_words BOOLEAN DEFAULT 1,
        delete_service_messages BOOLEAN DEFAULT 1,
        welcome_enabled BOOLEAN DEFAULT 1,
        rules TEXT DEFAULT 'No rules set yet.',
        restrict_bio_links BOOLEAN DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS warnings (
        user_id TEXT,
        chat_id TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, chat_id)
    )`);

    // Phase 2 Tables
    
    // Locks: Stores which media types are locked in a group
    db.run(`CREATE TABLE IF NOT EXISTS group_locks (
        chat_id TEXT,
        lock_type TEXT,
        PRIMARY KEY (chat_id, lock_type)
    )`);

    // Filters: Automated responses triggered by keywords
    db.run(`CREATE TABLE IF NOT EXISTS group_filters (
        chat_id TEXT,
        keyword TEXT,
        response TEXT,
        PRIMARY KEY (chat_id, keyword)
    )`);

    // Notes: Information accessible via #note_name
    db.run(`CREATE TABLE IF NOT EXISTS group_notes (
        chat_id TEXT,
        note_name TEXT,
        content TEXT,
        PRIMARY KEY (chat_id, note_name)
    )`);

    // Blacklist: Words that trigger message deletion
    db.run(`CREATE TABLE IF NOT EXISTS blacklists (
        chat_id TEXT,
        word TEXT,
        PRIMARY KEY (chat_id, word)
    )`);

    // Auto-Delete Settings
    db.run(`CREATE TABLE IF NOT EXISTS group_autodelete (
        chat_id TEXT PRIMARY KEY,
        delay_seconds INTEGER
    )`);

    // Messages Scheduled for Deletion
    db.run(`CREATE TABLE IF NOT EXISTS messages_to_delete (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        message_id INTEGER,
        delete_at INTEGER
    )`);
}

// Wrapper for Promises to make async queries easier
const dbAsync = {
    get: (query, params) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => err ? reject(err) : resolve(row));
    }),
    all: (query, params) => new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
    }),
    run: (query, params) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if(err) reject(err);
            else resolve(this);
        });
    })
};

module.exports = { db, dbAsync };
