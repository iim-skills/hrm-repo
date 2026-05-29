import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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

// --- Schemas (inline to avoid import issues with tsx runner) ---

const EmployeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    department: { type: String, required: true, trim: true },
    genderFlag: { type: String, enum: ['male', 'female', 'other'], required: true },
    joiningDate: { type: Date, required: true },
    currentRosterTier: { type: Number, default: 1, min: 1, max: 3 },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['admin', 'hr', 'manager', 'employee'], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'hr', 'manager', 'employee'], required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function seed() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  console.log('🗑️  Clearing existing data (all 11 collections)...');
  await Employee.deleteMany({});
  await User.deleteMany({});

  // Wipe remaining collections to prevent any orphaned or stale development records
  if (mongoose.connection.db) {
    const collectionsToClear = [
      'employee_tiers',
      'tier_history',
      'frozen_monthly_summaries',
      'monthly_attendance_summaries',
      'leave_balances',
      'compliance_alerts',
      'sandwich_flags',
      'wfh_restrictions',
      'attendances'
    ];
    for (const collName of collectionsToClear) {
      await mongoose.connection.db.collection(collName).deleteMany({}).catch(() => {});
    }
  }

  // Create single pristine Admin account
  console.log('👤 Creating Admin Employee...');
  const adminEmployee = await Employee.create({
    name: 'Admin',
    email: 'admin@iimskills.com',
    department: 'HR',
    genderFlag: 'male',
    joiningDate: new Date('2026-04-01'),
    currentRosterTier: 1,
    managerId: null,
    role: 'admin',
    isActive: true,
  });

  const hashedAdminPassword = await bcrypt.hash('admin123', 12);
  
  console.log('👤 Creating Admin User Account...');
  const adminUser = await User.create({
    email: 'admin@iimskills.com',
    password: hashedAdminPassword,
    role: 'admin',
    employeeId: adminEmployee._id,
    isActive: true,
  });

  // Seed managers/supervisors reporting to the Admin
  console.log('👤 Seeding supervisors reporting to Admin...');
  const newManagersData = [
    { name: 'Krishna Tyagi', email: 'krishna@iimskills.com', department: 'Development', genderFlag: 'male', role: 'manager' },
    { name: 'Vartika jain', email: 'vartika@iimskills.com', department: 'HR', genderFlag: 'female', role: 'hr' },
    { name: 'Ankit Sardana', email: 'ankit.sardana@iimskills.com', department: 'Marketing', genderFlag: 'male', role: 'manager' },
    { name: 'Nabeen Mishra', email: 'nabeen@iimskills.com', department: 'SEO', genderFlag: 'male', role: 'manager' },
    { name: 'Bhaskar', email: 'bhaskar@iimskills.com', department: 'DA', genderFlag: 'male', role: 'manager' },
    { name: 'Rohit', email: 'rohit@iimskills.com', department: 'DA', genderFlag: 'male', role: 'manager' },
    { name: 'Akanksha Suyal', email: 'akanksha@iimskills.com', department: 'DM', genderFlag: 'female', role: 'manager' },
    { name: 'Raunaq Singh Juneja', email: 'raunaq@iimskills.com', department: 'DM', genderFlag: 'male', role: 'manager' },
    { name: 'Shiva Shrivastava', email: 'shiva@iimskills.com', department: 'FM/IB', genderFlag: 'male', role: 'manager' },
    { name: 'Parv Kaushik', email: 'parv@iimskills.com', department: 'ACCA', genderFlag: 'male', role: 'manager' },
    { name: 'Chirag', email: 'chirag@iimskills.com', department: 'Medical coding', genderFlag: 'male', role: 'manager' },
    { name: 'Vinay', email: 'vinay@iimskills.com', department: 'CW', genderFlag: 'male', role: 'manager' },
  ];

  // A map to look up a supervisor's user ID by their name (lowercase keys for flexible lookup)
  const supervisorUserMap = new Map<string, string>();
  supervisorUserMap.set('admin', adminUser._id.toString());

  for (const mData of newManagersData) {
    const seededManagerEmployee = await Employee.create({
      name: mData.name,
      email: mData.email,
      department: mData.department,
      genderFlag: mData.genderFlag,
      joiningDate: new Date('2026-04-01'),
      currentRosterTier: 1,
      managerId: adminUser._id, // All supervisors report to Admin!
      role: mData.role,
      isActive: true,
    });

    const managerPassword = await bcrypt.hash('manager123', 12);
    const managerUser = await User.create({
      email: mData.email,
      password: managerPassword,
      role: mData.role,
      employeeId: seededManagerEmployee._id,
      isActive: true,
    });

    // Populate supervisor lookup maps
    supervisorUserMap.set(mData.name.toLowerCase(), managerUser._id.toString());
  }

  // Seed regular employees with explicit designated supervisor names
  console.log('👤 Seeding regular employees with custom reporting structures...');
  const regularEmployeesData = [
    // Development (Krishna Tyagi)
    { name: 'Swayam Sharma', email: 'swayam.sharma@iimskill.com', department: 'Development', managerName: 'Krishna Tyagi' },
    { name: 'Mohit Adhikari', email: 'mohit.adhikari@iimskill.com', department: 'Development', managerName: 'Krishna Tyagi' },
    
    // HR (Vartika jain)
    { name: 'Shruti Singh', email: 'shruti.singh@iimskill.com', department: 'HR', managerName: 'Vartika jain' },
    { name: 'Pushkin Bhatia', email: 'pushkin.bhatia@iimskill.com', department: 'HR', managerName: 'Vartika jain' },
    { name: 'Akankshya', email: 'akankshya@iimskill.com', department: 'HR', managerName: 'Vartika jain' },
    { name: 'Arshiya', email: 'arshiya@iimskill.com', department: 'HR', managerName: 'Vartika jain' },
    
    // Marketing (Ankit Sardana)
    { name: 'Simran Goswami', email: 'simran.goswami@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Anshul', email: 'anshul@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Vishal', email: 'vishal@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Manish', email: 'manish@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Getika', email: 'getika@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Anuja', email: 'anuja@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Prerna', email: 'prerna@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Krishna', email: 'krishna.emp@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Rajat', email: 'rajat@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    { name: 'Mayank', email: 'mayank@iimskill.com', department: 'Marketing', managerName: 'Ankit Sardana' },
    
    // SEO (Nabeen Mishra)
    { name: 'Vikas Singh', email: 'vikas.singh@iimskill.com', department: 'SEO', managerName: 'Nabeen Mishra' },
    { name: 'Sumanth', email: 'sumanth@iimskill.com', department: 'SEO', managerName: 'Nabeen Mishra' },
    { name: 'Kritika', email: 'kritika@iimskill.com', department: 'SEO', managerName: 'Nabeen Mishra' },
    { name: 'Ankit', email: 'ankit@iimskill.com', department: 'SEO', managerName: 'Nabeen Mishra' },
    
    // DA (Bhaskar)
    { name: 'Suman', email: 'suman@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Vivek', email: 'vivek@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Shreshtha', email: 'shreshtha@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Shubham', email: 'shubham@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Shekhar', email: 'shekhar@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Nishant', email: 'nishant@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Shreya', email: 'shreya@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    { name: 'Gautam', email: 'gautam@iimskill.com', department: 'DA', managerName: 'Bhaskar' },
    
    // DA (Rohit)
    { name: 'Ayushi', email: 'ayushi@iimskill.com', department: 'DA', managerName: 'Rohit' },
    { name: 'Mukul', email: 'mukul@iimskill.com', department: 'DA', managerName: 'Rohit' },
    { name: 'Harshita', email: 'harshita@iimskill.com', department: 'DA', managerName: 'Rohit' },
    { name: 'Nancy', email: 'nancy@iimskill.com', department: 'DA', managerName: 'Rohit' },
    { name: 'Vidhushi', email: 'vidhushi@iimskill.com', department: 'DA', managerName: 'Rohit' },
    { name: 'Talha', email: 'talha@iimskill.com', department: 'DA', managerName: 'Rohit' },
    
    // DM (Akanksha Suyal)
    { name: 'Vidhi Sethi', email: 'vidhi.sethi@iimskill.com', department: 'DM', managerName: 'Akanksha Suyal' },
    { name: 'Mansi', email: 'mansi@iimskill.com', department: 'DM', managerName: 'Akanksha Suyal' },
    { name: 'Sakshi', email: 'sakshi@iimskill.com', department: 'DM', managerName: 'Akanksha Suyal' },
    
    // DM (Raunaq Singh Juneja)
    { name: 'Dhruv', email: 'dhruv@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Shweta', email: 'shweta@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Khushi', email: 'khushi@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Sneha Sharma', email: 'sneha.sharma@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'ILMA', email: 'ilma@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Pooja', email: 'pooja@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Anjali', email: 'anjali@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    { name: 'Teesha', email: 'teesha@iimskill.com', department: 'DM', managerName: 'Raunaq Singh Juneja' },
    
    // FM/IB (Shiva Shrivastava)
    { name: 'Arushika', email: 'arushika@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Amit', email: 'amit@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Shreshth', email: 'shreshth@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Komal', email: 'komal@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Nikhat', email: 'nikhat@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Anushika', email: 'anushika@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    { name: 'Manorama', email: 'manorama@iimskill.com', department: 'FM/IB', managerName: 'Shiva Shrivastava' },
    
    // ACCA (Parv Kaushik)
    { name: 'Vansh', email: 'vansh@iimskill.com', department: 'ACCA', managerName: 'Parv Kaushik' },
    
    // Medical coding (Chirag)
    { name: 'Yamini', email: 'yamini@iimskill.com', department: 'Medical coding', managerName: 'Chirag' },
    
    // ACCOUNTS (Reports directly to Admin)
    { name: 'Priya', email: 'priya@iimskill.com', department: 'ACCOUNTS', managerName: 'Admin' },
    
    // PRODUCT DELIVERY (Report directly to Admin)
    { name: 'Sonam Prabha', email: 'sonam.prabha@iimskill.com', department: 'PRODUCT DELIVERY', managerName: 'Admin' },
    { name: 'Esha', email: 'esha@iimskill.com', department: 'PRODUCT DELIVERY', managerName: 'Admin' },
    { name: 'Jai', email: 'jai@iimskill.com', department: 'PRODUCT DELIVERY', managerName: 'Admin' }
  ];

  const femaleNames = [
    'aayushi', 'akanksha', 'anuja', 'arushika', 'getika', 'gurleen', 'harshita', 'ilma',
    'jayeeta', 'jyoti', 'kashish', 'khushi', 'komal', 'manorama', 'mansi', 'nancy',
    'nikhat', 'priya', 'sakshi', 'shreshtha', 'shruti', 'shweta', 'sneha', 'sonam',
    'vanthana', 'vartika', 'vidhi', 'prerna', 'simran', 'aditi', 'anushika', 'yamini',
    'priyanka', 'pooja', 'esha', 'akankshya', 'arshiya', 'kritika', 'vidhushi', 'shreya',
    'anjali', 'teesha'
  ];
  
  const getGender = (name: string): 'female' | 'male' => {
    const lowerName = name.toLowerCase();
    return femaleNames.some(f => lowerName.includes(f)) ? 'female' : 'male';
  };

  const regularPassword = await bcrypt.hash('user123', 12);

  for (const mData of regularEmployeesData) {
    // Resolve dynamic manager ID from lookup map, fall back to Admin
    const managerNameKey = mData.managerName.toLowerCase();
    const assignedManagerUserIdStr = supervisorUserMap.get(managerNameKey) || adminUser._id.toString();
    const assignedManagerUserId = new mongoose.Types.ObjectId(assignedManagerUserIdStr);

    const seededEmployee = await Employee.create({
      name: mData.name,
      email: mData.email,
      department: mData.department,
      genderFlag: getGender(mData.name),
      joiningDate: new Date('2026-04-01'),
      currentRosterTier: 1,
      managerId: assignedManagerUserId,
      role: 'employee',
      isActive: true,
    });

    await User.create({
      email: mData.email,
      password: regularPassword,
      role: 'employee',
      employeeId: seededEmployee._id,
      isActive: true,
    });
  }

  console.log('\n🌱 Seed completed successfully!');
  console.log('─────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Admin:     admin@iimskills.com / admin123');
  console.log('  Supervisors:  *@iimskills.com / manager123 (Vartika is role:hr, others are role:manager)');
  console.log('  Employees: *@iimskill.com / user123 (regular employees)');
  console.log('─────────────────────────────────');
  console.log(`Total: ${await Employee.countDocuments()} employees, ${await User.countDocuments()} users`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
