import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Load .env.local manually
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    });
  }
} catch (e) {
  console.warn('Could not load .env.local:', e);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrm';

async function runMigration() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected successfully!');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  // 1. Get raw attendance collection
  const attendanceColl = db.collection('attendances');

  // 2. Count current ABSENT records
  const absentCount = await attendanceColl.countDocuments({ status: 'ABSENT' });
  console.log(`🔍 Found ${absentCount} records marked as 'ABSENT'`);

  if (absentCount > 0) {
    console.log('🔄 Converting ABSENT status to LWP...');
    const mainUpdateResult = await attendanceColl.updateMany(
      { status: 'ABSENT' },
      { 
        $set: { 
          status: 'LWP',
          notes: 'Auto-converted from Absent to LWP.'
        } 
      }
    );
    console.log(`✅ Converted ${mainUpdateResult.modifiedCount} records status to 'LWP'`);
  }

  // 3. Update history arrays
  console.log("🔄 Checking update history items for status 'ABSENT'...");
  const recordsWithAbsentHistory = await attendanceColl.countDocuments({
    'history.status': 'ABSENT'
  });
  console.log(`🔍 Found ${recordsWithAbsentHistory} records with history items containing 'ABSENT'`);

  if (recordsWithAbsentHistory > 0) {
    // Perform positional array update to change history status 'ABSENT' to 'LWP'
    const historyUpdateResult = await attendanceColl.updateMany(
      { 'history.status': 'ABSENT' },
      { 
        $set: { 'history.$[elem].status': 'LWP' }
      },
      { 
        arrayFilters: [{ 'elem.status': 'ABSENT' }] 
      }
    );
    console.log(`✅ Updated ${historyUpdateResult.modifiedCount} histories successfully.`);
  }

  // 4. Trigger system self-healing re-scan
  console.log('🔄 Re-scanning all compliance rules and recalculating monthly summaries...');
  const { reScanAllComplianceRules } = await import('./policyEngines');
  await reScanAllComplianceRules();
  console.log('✅ Re-scan and self-healing successfully completed!');

  await mongoose.disconnect();
  console.log('🏁 Migration complete!');
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
