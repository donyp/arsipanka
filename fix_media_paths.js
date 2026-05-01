const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Add backend modules to paths
const modulePath = path.join(__dirname, 'backend', 'node_modules');
module.paths.push(modulePath);

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const rclonePath = path.join(__dirname, 'rclone.exe');
const configPath = path.join(__dirname, 'rclone.conf');

async function fixPaths() {
    console.log('--- Starting Path Normalization ---');

    const { data: allMedia, error } = await supabase.from('ads_media').select('*').is('deleted_at', null);

    if (error) {
        console.error('Error fetching media:', error);
        return;
    }

    console.log(`Found ${allMedia.length} active media items.`);

    for (const media of allMedia) {
        let currentPath = media.storage_path;
        if (!currentPath.startsWith('/ads-media/')) continue;

        // Path is like /ads-media/Category/File.png
        const parts = currentPath.split('/');
        // Normalize only the category part (parts[2])
        if (parts.length >= 3) {
            const categoryOrig = parts[2];
            const categoryLower = categoryOrig.toLowerCase();

            if (categoryOrig !== categoryLower) {
                const newPath = currentPath.replace(`/${categoryOrig}/`, `/${categoryLower}/`);
                console.log(`Fixing path for ${media.nama_file}: ${currentPath} -> ${newPath}`);

                // 1. Move on Terabox
                const oldFull = `terabox:${currentPath.substring(1)}`;
                const newFull = `terabox:${newPath.substring(1)}`;

                try {
                    console.log(`Rclone: moving ${oldFull} to ${newFull}`);
                    execSync(`"${rclonePath}" --config "${configPath}" move "${oldFull}" "${newFull}"`, { stdio: 'inherit' });
                } catch (err) {
                    console.warn(`Rclone move failed (might already be fixed): ${err.message}`);
                }

                // 2. Update DB
                const { error: updateError } = await supabase
                    .from('ads_media')
                    .update({ storage_path: newPath })
                    .eq('id', media.id);

                if (updateError) {
                    console.error(`DB Update failed for ID ${media.id}:`, updateError);
                } else {
                    console.log('DB Update success.');
                }
            }
        }
    }
    console.log('--- Path Normalization Done ---');
}

fixPaths();
