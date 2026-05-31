/**
 * Seeds 10 open demo projects for the wallet client.
 * Run: npm run db:seed  (from server/)
 */
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const WALLET_ADDRESS = '0x73822441de9b8adde6c75df62313f6d6f00bef4e'.toLowerCase();
const DEMO_PREFIX = '[Demo] ';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

type DemoProject = {
  title: string;
  description: string;
  budget: number;
  requirements?: string;
  paymentNotes?: string;
  links?: { title: string; url: string }[];
  milestones?: {
    title: string;
    description?: string;
    amount?: number;
    dueDate?: string;
    links?: { title: string; url: string }[];
  }[];
};

const DEMO_PROJECTS: DemoProject[] = [
  {
    title: 'E-commerce storefront (React + Stripe)',
    description:
      '• Rebuild product catalog and cart\n• Integrate Stripe Checkout\n• Admin order dashboard\n• Mobile-responsive UI',
    budget: 4200,
    requirements:
      '• React 18 + TypeScript\n• Node 20 API you host or we provide\n• WCAG AA on checkout flow',
    paymentNotes: '40% kickoff, 40% beta, 20% launch. USDT preferred.',
    links: [
      { title: 'Current store (reference)', url: 'https://example.com/store-ref' },
      { title: 'Brand guidelines', url: 'https://example.com/brand' },
    ],
    milestones: [
      {
        title: 'Discovery & wireframes',
        description: '• Sitemap\n• Key page wireframes\n• Tech plan',
        amount: 800,
        dueDate: '2026-06-15',
      },
      {
        title: 'MVP storefront',
        description: '• Catalog + cart\n• Stripe test mode',
        amount: 2200,
        dueDate: '2026-07-20',
      },
      {
        title: 'Launch & handoff',
        description: '• Production deploy\n• Short Loom walkthrough',
        amount: 1200,
        dueDate: '2026-08-10',
      },
    ],
  },
  {
    title: 'Flutter fitness tracking app',
    description:
      '• Onboarding + goals\n• Workout logging\n• Charts for weekly progress\n• Push reminders',
    budget: 6800,
    requirements: '• Flutter 3.x\n• Firebase Auth + Firestore\n• iOS + Android builds',
    paymentNotes: 'Milestone-based releases every 2 weeks.',
    links: [{ title: 'Figma flows', url: 'https://www.figma.com/file/demo-fitness' }],
    milestones: [
      { title: 'UI shell + auth', amount: 2000, dueDate: '2026-06-30' },
      { title: 'Core tracking features', amount: 3200, dueDate: '2026-08-01' },
      { title: 'Store submission support', amount: 1600, dueDate: '2026-09-01' },
    ],
  },
  {
    title: 'Smart contract security review',
    description:
      '• Static analysis pass\n• Manual review of core contracts\n• Written report with severity ratings\n• Fix verification (one round)',
    budget: 3500,
    requirements: '• Solidity 0.8.x\n• Foundry test suite available\n• NDA signed before repo access',
    paymentNotes: '50% upfront, 50% on report delivery.',
    links: [{ title: 'Repo (private)', url: 'https://github.com/example/defi-core' }],
    milestones: [
      { title: 'Initial assessment', amount: 1200, dueDate: '2026-06-10' },
      { title: 'Full audit report', amount: 2300, dueDate: '2026-06-25' },
    ],
  },
  {
    title: 'Marketing landing page redesign',
    description:
      '• Hero + social proof\n• Pricing section\n• FAQ + footer\n• Animations (light)',
    budget: 1800,
    requirements: '• Next.js or Astro\n• Tailwind\n• Lighthouse 90+ mobile',
    paymentNotes: 'Fixed price, net-7 on approval.',
    milestones: [
      { title: 'Design implementation', amount: 1100, dueDate: '2026-06-18' },
      { title: 'QA + deploy', amount: 700, dueDate: '2026-06-28' },
    ],
  },
  {
    title: 'Node.js API for inventory microservice',
    description:
      '• REST + OpenAPI spec\n• Postgres schema\n• Redis cache layer\n• Docker compose for local dev',
    budget: 5200,
    requirements: '• NestJS or Fastify\n• Prisma or TypeORM\n• Jest coverage on services',
    paymentNotes: 'Weekly invoices against milestone acceptance.',
    links: [{ title: 'Architecture sketch', url: 'https://example.com/docs/inventory-api' }],
    milestones: [
      { title: 'Schema + auth', amount: 1500, dueDate: '2026-07-01' },
      { title: 'CRUD + cache', amount: 2500, dueDate: '2026-07-25' },
      { title: 'Docs + deployment', amount: 1200, dueDate: '2026-08-05' },
    ],
  },
  {
    title: 'WordPress to headless CMS migration',
    description:
      '• Content export\n• Sanity (or Strapi) setup\n• Next.js front-end\n• Redirect map for SEO',
    budget: 3900,
    requirements: '• Preserve URLs where possible\n• Image optimization pipeline',
    paymentNotes: '30/40/30 across three milestones.',
    milestones: [
      { title: 'Content modeling', amount: 900, dueDate: '2026-06-22' },
      { title: 'Front-end build', amount: 2100, dueDate: '2026-07-30' },
      { title: 'Cutover weekend', amount: 900, dueDate: '2026-08-15' },
    ],
  },
  {
    title: 'Analytics dashboard (React + charts)',
    description:
      '• Connect to existing REST metrics\n• Filters by date range\n• CSV export\n• Role-based views',
    budget: 2900,
    requirements: '• Recharts or Chart.js\n• Dark mode support',
    paymentNotes: 'Paid on milestone sign-off.',
    links: [{ title: 'API docs', url: 'https://example.com/api/metrics' }],
    milestones: [
      { title: 'Data layer + tables', amount: 1200, dueDate: '2026-07-05' },
      { title: 'Charts + polish', amount: 1700, dueDate: '2026-07-28' },
    ],
  },
  {
    title: 'CI/CD pipeline (GitHub Actions + AWS)',
    description:
      '• Build/test workflow\n• Staging deploy on main\n• Production manual gate\n• Slack notifications',
    budget: 2400,
    requirements: '• AWS ECS or Lambda (discuss)\n• Secrets via SSM',
    paymentNotes: 'Single fixed fee, 50% start / 50% done.',
    milestones: [
      { title: 'Staging pipeline', amount: 1400, dueDate: '2026-06-20' },
      { title: 'Production + docs', amount: 1000, dueDate: '2026-07-01' },
    ],
  },
  {
    title: 'NFT marketplace front-end',
    description:
      '• Wallet connect\n• Browse + detail pages\n• List/buy flows (mock API ok)\n• Responsive grid',
    budget: 4500,
    requirements: '• wagmi + viem\n• Tailwind\n• Testnet only for demo',
    paymentNotes: 'USDT, three milestone payments.',
    links: [{ title: 'Design system', url: 'https://www.figma.com/file/demo-nft' }],
    milestones: [
      { title: 'Browse experience', amount: 1800, dueDate: '2026-07-10' },
      { title: 'Wallet + transactions UI', amount: 2000, dueDate: '2026-08-01' },
      { title: 'Hardening + handoff', amount: 700, dueDate: '2026-08-20' },
    ],
  },
  {
    title: 'AI support chatbot (web widget)',
    description:
      '• Embed widget on marketing site\n• FAQ + docs ingestion\n• Escalation to email\n• Basic analytics',
    budget: 3100,
    requirements: '• OpenAI-compatible API\n• Rate limiting\n• GDPR-friendly logging',
    paymentNotes: 'Milestone payments; API costs billed separately by client.',
    milestones: [
      { title: 'Widget + backend proxy', amount: 1600, dueDate: '2026-07-12' },
      { title: 'Knowledge base + launch', amount: 1500, dueDate: '2026-08-01' },
    ],
  },
];

async function ensureClientForWallet(): Promise<number> {
  const existing = await prisma.wallet.findUnique({
    where: { address: WALLET_ADDRESS },
    include: { user: true },
  });

  if (existing?.user) {
    if (existing.user.role !== Role.CLIENT) {
      await prisma.user.update({
        where: { id: existing.user.id },
        data: { role: Role.CLIENT },
      });
      console.log(
        `Updated user #${existing.user.id} (${existing.user.username}) → role CLIENT`,
      );
    }
    return existing.user.id;
  }

  const email = `${WALLET_ADDRESS}@wallet.proofhire`;
  const usernameBase = `ph_${WALLET_ADDRESS.slice(2, 14)}`;
  let username = usernameBase;
  let suffix = 0;
  while (await prisma.user.findUnique({ where: { username } })) {
    suffix += 1;
    username = `${usernameBase}_${suffix}`;
  }

  const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  const user = await prisma.user.create({
    data: {
      email,
      password,
      username,
      role: Role.CLIENT,
      wallet: {
        create: {
          address: WALLET_ADDRESS,
          chain: '1',
        },
      },
      profile: {
        create: {
          fullName: 'Demo Client',
          bio: 'Seeded wallet client for marketplace demos.',
        },
      },
    },
  });

  console.log(`Created CLIENT user #${user.id} (${username}) for wallet ${WALLET_ADDRESS}`);
  return user.id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to server/.env');
  }

  const clientId = await ensureClientForWallet();

  const removed = await prisma.job.deleteMany({
    where: {
      clientId,
      title: { startsWith: DEMO_PREFIX },
    },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} previous demo project(s).`);
  }

  for (const project of DEMO_PROJECTS) {
    await prisma.job.create({
      data: {
        title: `${DEMO_PREFIX}${project.title}`,
        description: project.description,
        budget: project.budget,
        requirements: project.requirements ?? null,
        paymentNotes: project.paymentNotes ?? null,
        links: project.links?.length ? project.links : undefined,
        milestones: project.milestones?.length ? project.milestones : undefined,
        status: 'OPEN',
        clientId,
      },
    });
  }

  console.log(`Seeded ${DEMO_PROJECTS.length} OPEN demo projects for client #${clientId}.`);
  console.log(`Wallet: ${WALLET_ADDRESS}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
