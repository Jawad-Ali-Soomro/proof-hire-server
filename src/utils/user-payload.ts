type ProfileShape = {
  fullName?: string | null;
  bio?: string | null;
  skills?: string | null;
  services?: string | null;
  avatar?: string | null;
  summary?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  linkedin?: string | null;
  github?: string | null;
  educationEntries?: unknown;
  projects?: unknown;
} | null;

export function isProfileComplete(user: {
  role: string;
  profile?: ProfileShape;
}): boolean {
  const p = user.profile;
  if (!p?.fullName?.trim()) return false;
  if (user.role === 'FREELANCER') return !!p.skills?.trim();
  if (user.role === 'CLIENT') return !!p.services?.trim();
  return false;
}

export function sanitizeUser(user: {
  id: number;
  email: string;
  username: string;
  role: string;
  profile?: ProfileShape;
}) {
  const u = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    profile: user.profile ?? null,
  };
  return {
    ...u,
    profileComplete: isProfileComplete({ ...u, profile: u.profile }),
  };
}
