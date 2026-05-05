require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createMod() {
    try {
        const email = 'mod@arsip.com';

        let { data: users, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) throw authError;

        let existing = users.users.find(u => u.email === email);
        let uid = existing ? existing.id : null;

        if (!uid) {
            const { data, error } = await supabase.auth.admin.createUser({
                email: email,
                password: 'Moderator123!',
                email_confirm: true
            });
            if (error) throw error;
            uid = data.user.id;
        }

        // Get an existing super_admin to copy structure if we don't know the exact columns
        const { data: sa } = await supabase.from('users').select('*').limit(1).single();
        console.log("Existing SA schema demo:", sa);

        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('Moderator123!', 10);

        const modData = {
            id: uid,
            name: 'Pusat Moderator',
            email: email,
            role: 'super_admin',
            permissions: ['IS_MODERATOR'],
            password_hash: hash
        };

        const { error: dbErr } = await supabase.from('users').insert(modData);
        if (dbErr) {
            console.error('Explicit DB Insert Error:', dbErr);
        } else {
            console.log('SUCCESS');
        }
    } catch (err) {
        console.error('Fatal Error:', err);
    }
}
createMod();
