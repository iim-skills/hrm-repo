import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

async function runBackup() {
  try {
    // 1. Read environment variables from .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env.local not found in the root directory.');
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    });

    const uri = envVars['MONGODB_URI'];
    if (!uri) {
      throw new Error('MONGODB_URI not found in .env.local');
    }

    // 2. Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected successfully!');

    // 3. Create a backups folder with timestamp in the root directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups', timestamp);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    console.log(`Created backup directory: ${backupDir}`);

    // 4. Fetch all collections dynamically
    const collections = await mongoose.connection.db?.listCollections().toArray();
    if (!collections || collections.length === 0) {
      console.log('No collections found in the database.');
      return;
    }

    // 5. Export each collection to a JSON file
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`Backing up collection: ${collectionName}...`);

      const docs = await mongoose.connection.db?.collection(collectionName).find({}).toArray();
      
      const filePath = path.join(backupDir, `${collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
      
      console.log(` -> Saved ${docs?.length || 0} documents to ${collectionName}.json`);
    }

    console.log(`\n✅ Backup completed successfully! All files saved in: /backups/${timestamp}`);

  } catch (err) {
    console.error('Backup failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runBackup();
