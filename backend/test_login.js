require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkdXJrbXN0Z2V5c2ljdWd6cGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzM3MTAsImV4cCI6MjA5MDk0OTcxMH0.x66uoMJXHUGr9e2v97GfX04uug_l5c6wQdPM4hKjJTE';
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey);
const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);

async function testScenario() {
    console.log("1. Membuat user dummy 'zona99'...");
    const email = 'zona99@arsip.local';
    const pwd = 'passwordzona99';

    // Delete if exists first
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existing = users.users.find(u => u.email === email);
    if (existing) {
        await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: pwd,
        email_confirm: true
    });

    if (authError) {
        console.error("Gagal create user:", authError);
        return;
    }
    console.log("✅ Create User Success!");

    console.log("2. Mencoba login menggunakan anon key...");
    const { data: loginData, error: loginError } = await supabaseAuthClient.auth.signInWithPassword({
        email: email,
        password: pwd
    });

    if (loginError) {
        console.error("❌ Login Failed!", loginError);
    } else {
        console.log("✅ Login Success!");
    }
}

testScenario();
