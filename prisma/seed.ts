import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

async function generateEmbedding(text: string): Promise<number[]> {
  const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExec, ['embeddings/generate_embedding.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Embedding process failed: ${errorOutput}`));
        return;
      }

      try {
        const parsed = JSON.parse(output);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

function buildVendorPrompt(name: string, description: string | null, traits: Record<string, number>): string {
  return [
    `Vendor: ${name}`,
    description ? `Description: ${description}` : '',
    'Traits:',
    ...Object.entries(traits).map(([key, value]) => `${key}: ${value}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(
  name: string,
  traits: Record<string, number>,
  behaviorPreferences?: Record<string, unknown>,
  isTestUser?: boolean,
): string {
  return [
    `User: ${name}`,
    isTestUser ? 'This is a test user for behavior experiments.' : '',
    'Personality traits:',
    ...Object.entries(traits).map(([key, value]) => `${key}: ${value}`),
    behaviorPreferences ? `Behavior preferences: ${JSON.stringify(behaviorPreferences)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  console.log('Seeding database with vendors and users...');

  await prisma.interaction.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  const vendorNames = [
    'Luminous Lounge',
    'Cozy Corner Studio',
    'Skyline Wellness',
    'Artisan Hub',
    'Harmony Haven',
    'Pulse Lab',
    'Serenity Suites',
    'Urban Craft',
    'Echo Point',
    'Nova Collective',
  ];

  const vendors = [];
  for (const name of vendorNames) {
    const traits = {
      serviceQuality: Math.ceil(Math.random() * 5),
      interactionStyle: Math.ceil(Math.random() * 5),
      serviceConduct: Math.ceil(Math.random() * 5),
      expertise: Math.ceil(Math.random() * 5),
      environment: Math.ceil(Math.random() * 5),
      atmosphere: Math.ceil(Math.random() * 5),
      design: Math.ceil(Math.random() * 5),
      hospitality: Math.ceil(Math.random() * 5),
      outcomeQuality: Math.ceil(Math.random() * 5),
      waitingTime: Math.ceil(Math.random() * 5),
      physicalElements: Math.ceil(Math.random() * 5),
      experienceTone: Math.ceil(Math.random() * 5),
    };

    const description = 'Sample vendor with varied service traits.';
    const prompt = buildVendorPrompt(name, description, traits);
    const embedding = await generateEmbedding(prompt);

    const vendor = await prisma.vendor.create({
      data: {
        name,
        description,
        ...traits,
        embedding,
      },
    });
    vendors.push(vendor);
  }

  const usersData = [
    {
      name: 'Adventurous Alex',
      traits: {
        adventurous: 5,
        decisive: 4,
        eccentric: 3,
        flexible: 4,
        loyal: 3,
        optimistic: 5,
        patient: 2,
        perfectionist: 2,
        punctual: 3,
      },
      behaviorPreferences: { likesAdventurousVendors: true },
      isTestUser: false,
    },
    {
      name: 'Precise Priya',
      traits: {
        adventurous: 2,
        decisive: 5,
        eccentric: 1,
        flexible: 3,
        loyal: 4,
        optimistic: 3,
        patient: 4,
        perfectionist: 5,
        punctual: 5,
      },
      behaviorPreferences: { valuesPunctuality: true },
      isTestUser: false,
    },
    {
      name: 'Calm Chris',
      traits: {
        adventurous: 3,
        decisive: 3,
        eccentric: 2,
        flexible: 4,
        loyal: 4,
        optimistic: 4,
        patient: 5,
        perfectionist: 3,
        punctual: 3,
      },
      behaviorPreferences: { prefersRelaxedAtmosphere: true },
      isTestUser: false,
    },
    {
      name: 'Bold Bella',
      traits: {
        adventurous: 4,
        decisive: 5,
        eccentric: 4,
        flexible: 3,
        loyal: 3,
        optimistic: 4,
        patient: 2,
        perfectionist: 3,
        punctual: 4,
      },
      behaviorPreferences: { likesCreativeDesign: true },
      isTestUser: false,
    },
    {
      name: 'Test Toggle User',
      traits: {
        adventurous: 3,
        decisive: 3,
        eccentric: 3,
        flexible: 3,
        loyal: 3,
        optimistic: 3,
        patient: 3,
        perfectionist: 3,
        punctual: 3,
      },
      behaviorPreferences: { description: 'Use this user to test behavior and trait adjustments.' },
      isTestUser: true,
    },
  ];

  const users = [];
  for (const u of usersData) {
    const prompt = buildUserPrompt(u.name, u.traits, u.behaviorPreferences, u.isTestUser);
    const embedding = await generateEmbedding(prompt);

    const user = await prisma.user.create({
      data: {
        name: u.name,
        ...u.traits,
        embedding,
        behaviorPreferences: u.behaviorPreferences,
        isTestUser: u.isTestUser,
      },
    });
    users.push(user);
  }

  // Simulated interactions to support behavior-based scoring
  const [user1, user2, user3, user4, testUser] = users;

  const interactionsData = [
    // Adventurous Alex likes more dynamic vendors
    { userId: user1.id, vendorId: vendors[0].id, liked: true, score: 5 },
    { userId: user1.id, vendorId: vendors[3].id, liked: true, score: 4 },
    { userId: user1.id, vendorId: vendors[5].id, liked: false, score: 2 },
    // Precise Priya prefers high service quality and punctuality
    { userId: user2.id, vendorId: vendors[1].id, liked: true, score: 5 },
    { userId: user2.id, vendorId: vendors[2].id, liked: true, score: 4 },
    { userId: user2.id, vendorId: vendors[7].id, liked: false, score: 1 },
    // Calm Chris prefers relaxed atmosphere
    { userId: user3.id, vendorId: vendors[4].id, liked: true, score: 5 },
    { userId: user3.id, vendorId: vendors[6].id, liked: true, score: 4 },
    // Bold Bella leans towards creative and high-energy vendors
    { userId: user4.id, vendorId: vendors[0].id, liked: true, score: 4 },
    { userId: user4.id, vendorId: vendors[8].id, liked: true, score: 5 },
    { userId: user4.id, vendorId: vendors[9].id, liked: false, score: 2 },
    // Test user with a couple of mixed interactions
    { userId: testUser.id, vendorId: vendors[2].id, liked: true, score: 4 },
    { userId: testUser.id, vendorId: vendors[5].id, liked: false, score: 1 },
  ];

  for (const i of interactionsData) {
    await prisma.interaction.create({
      data: i,
    });
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


