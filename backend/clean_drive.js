require('dotenv').config();
const { google } = require('googleapis');

async function cleanDrive() {
    const auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });

    // Find all files in root
    const rootFiles = await drive.files.list({
        q: "'root' in parents",
        fields: 'files(id, name)'
    });

    console.log(`Found ${rootFiles.data.files.length} items in Service Account Root.`);

    for (const f of rootFiles.data.files) {
        console.log(`Deleting: ${f.name} (${f.id})`);
        try {
            await drive.files.delete({ fileId: f.id });
        } catch (e) {
            console.error("Failed to delete", f.name, e.message);
        }
    }

    // Also clear trash to free up quota!
    console.log("Emptying trash...");
    await drive.files.emptyTrash();
    console.log("Cleanup Done.");
}

cleanDrive().catch(console.error);
