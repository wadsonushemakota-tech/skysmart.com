// Table definitions shared by server.js and scripts/copy-db.js. Safe to run repeatedly.
async function ensureSchema(client) {
    // Create basic tables
    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            price DECIMAL NOT NULL,
            sizes INTEGER[],
            colors TEXT[],
            images TEXT[],
            description TEXT,
            category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            text TEXT,
            media_url TEXT,
            media_type TEXT DEFAULT 'text',
            reply_to_id INTEGER REFERENCES messages(id),
            reply_to_user TEXT,
            reply_to_text TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Add columns if they don't exist (migration)
    await client.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_url') THEN
                ALTER TABLE messages ADD COLUMN media_url TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_type') THEN
                ALTER TABLE messages ADD COLUMN media_type TEXT DEFAULT 'text';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_id') THEN
                ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_user') THEN
                ALTER TABLE messages ADD COLUMN reply_to_user TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_text') THEN
                ALTER TABLE messages ADD COLUMN reply_to_text TEXT;
            END IF;
        END $$;

        ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT FALSE;
    `);
}

module.exports = { ensureSchema };
