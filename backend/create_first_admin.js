require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createFirstAdmin() {
    console.log("Mencoba membuat akun Super Admin pertama...");

    // 1. Create Native Auth User
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: 'admin@arsip.local',
        password: 'admin123',
        email_confirm: true
    });

    if (authError) {
        console.error("Gagal membuat user auth:", authError.message);
        return;
    }

    const userId = authData.user.id;
    console.log("✅ User terbuat di Native Auth. ID:", userId);

    // 2. Insert into custom Users table
    const { error: dbError } = await supabaseAdmin
        .from('users')
        .insert({
            id: userId,
            name: 'Super Admin Anka',
            username: 'admin',
            role: 'super_admin',
            zona: null
        });

    if (dbError) {
        console.error("Gagal menyisipkan info ke tabel Users:", dbError.message);
        return;
    }

    console.log("✅ Berhasil membuat akun Super Admin!");
    console.log(">> Username: admin");
    console.log(">> Password: admin123");
}

createFirstAdmin();
