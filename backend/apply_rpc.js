require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function applySql() {
    const sql = `
    CREATE OR REPLACE FUNCTION get_or_create_recent_batch(target_user_id UUID, window_seconds INTEGER)
    RETURNS UUID AS $$
    DECLARE
        found_id UUID;
    BEGIN
        -- Try to find a recent batch (within window_seconds)
        SELECT id INTO found_id 
        FROM upload_batches 
        WHERE uploader_id = target_user_id 
          AND created_at >= NOW() - (window_seconds || ' seconds')::INTERVAL 
        ORDER BY created_at DESC 
        LIMIT 1;

        -- If not found, create one
        IF found_id IS NULL THEN
            INSERT INTO upload_batches (uploader_id, total_files, success_files)
            VALUES (target_user_id, 0, 0)
            RETURNING id INTO found_id;
        END IF;

        RETURN found_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql }).catch(() => ({ error: { message: 'RPC run_sql missing' } }));

    if (error) {
        console.log("RPC run_sql not available, please run this SQL manually in Supabase SQL Editor:");
        console.log(sql);
    } else {
        console.log("SQL Function applied successfully.");
    }
}
applySql();
