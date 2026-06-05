import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

// ⚠️ IMPORTANT: Set this to the exact folder name of your backup inside the 'backups' directory
// Example: '2026-06-05T04-35-12-123Z'
const BACKUP_FOLDER_NAME: string = '2026-06-05T06-06-39-095Z'; 

async function runRestore() {
  try {
    const backupDir = path.join(process.cwd(), 'backups', BACKUP_FOLDER_NAME);
    
    if (!fs.existsSync(backupDir) || BACKUP_FOLDER_NAME === 'ENTER_YOUR_BACKUP_FOLDER_NAME_HERE') {
      throw new Error(`\n❌ Backup folder not found: ${backupDir}\n👉 Please update the BACKUP_FOLDER_NAME variable at the top of the restore_db.ts script!`);
    }

    // 1. Read environment variables from .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    });

    const uri = envVars['MONGODB_URI'];
    if (!uri) throw new Error('MONGODB_URI not found in .env.local');

    // 2. Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected successfully!');

    // 3. Read all JSON files from the backup directory
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No JSON files found in the backup directory.');
      return;
    }

    // 4. Restore each collection
    for (const file of files) {
      const collectionName = file.replace('.json', '');
      console.log(`\nRestoring collection: ${collectionName}...`);

      // Read and parse the JSON data
      const filePath = path.join(backupDir, file);
      const fileData = fs.readFileSync(filePath, 'utf8');
      const docs = JSON.parse(fileData);

      if (docs.length === 0) {
        console.log(` -> 0 documents to restore for ${collectionName}. Skipping.`);
        continue;
      }

      // Recursively revive Dates and ObjectIds
      const reviveTypes = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(reviveTypes);
        if (typeof obj === 'object') {
          const newObj: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              // Convert to ObjectId if it's a 24-character hex string and likely an ID
              if (/^[0-9a-fA-F]{24}$/.test(value) && (key === '_id' || key.endsWith('Id') || key === 'overriddenBy')) {
                newObj[key] = new mongoose.Types.ObjectId(value);
              } 
              // Convert to Date if it's an ISO date string
              else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
                newObj[key] = new Date(value);
              } else {
                newObj[key] = value;
              }
            } else {
              newObj[key] = reviveTypes(value);
            }
          }
          return newObj;
        }
        return obj;
      };

      const processedDocs = docs.map((doc: any) => reviveTypes(doc));

      const collection = mongoose.connection.db?.collection(collectionName);
      if (!collection) continue;

      // ⚠️ WARNING: This clears the existing collection before inserting the backup!
      console.log(` -> Clearing existing data in ${collectionName}...`);
      await collection.deleteMany({});

      // Insert the backed-up documents
      console.log(` -> Inserting ${processedDocs.length} documents...`);
      await collection.insertMany(processedDocs);
      
      console.log(` -> ✅ Restored ${collectionName} successfully!`);
    }

    console.log(`\n🎉 Full database restore completed successfully from: ${BACKUP_FOLDER_NAME}`);

  } catch (err) {
    console.error('Restore failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runRestore();
