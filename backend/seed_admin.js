// ============================================================
// Seed Script — Create first Super Admin user
// Run: node seed_admin.js
// ============================================================
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
    const email = process.env.ADMIN_EMAIL || 'admin@arsip.local';
    const password = process.env.ADMIN_PASSWORD || 'Admin123!';
    const name = 'Super Admin';

    console.log(`Creating Super Admin: ${email}`);

    // Hash
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Check existing
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) {
        console.log('⚠️  User already exists. Skipping.');
        return;
    }

    const { error } = await supabase.from('users').insert({
        email,
        password_hash,
        name,
        role: 'super_admin',
        is_active: true
    });

    if (error) {
        console.error('❌ Failed:', error.message);
    } else {
        console.log('✅ Super Admin created successfully!');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
    }
}

seed().then(() => process.exit(0));
