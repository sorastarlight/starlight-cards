import { getMyStaffAccess } from '../staff-service.js';
import {
  applyAdminCapabilityGates,
  formatStaffRole,
  mountAdminCrumb,
  setAdminStatus
} from '../admin-shell.js';

const HUB_SECTIONS = [
  {
    id: 'site',
    title: 'Site & Navigation',
    hint: 'Live shell chrome, page copy, news, and broadcasts',
    tools: [
      {
        id: 'ui',
        href: 'admin-ui.html',
        title: 'Navigation Studio',
        blurb: 'Reorder, edit, and preview the top bar, mega menus, account menu, and page titles.'
      },
      {
        id: 'website',
        href: 'admin-website.html',
        title: 'Website Editor',
        blurb: 'Edit Home, About, Socials, Login, and binder landing copy (not navigation).'
      },
      {
        id: 'news',
        href: 'admin-news.html',
        title: 'News & Updates',
        blurb: 'Publish Home announcements and featured updates.'
      },
      {
        id: 'notifications',
        href: 'admin-notifications.html',
        title: 'Notification Broadcasts',
        blurb: 'Send an on-site announcement to every registered collector.'
      }
    ]
  },
  {
    id: 'collectors',
    title: 'Collectors & Staff',
    hint: 'Accounts, roles, moderation, and audit history',
    tools: [
      {
        id: 'users',
        href: 'admin-users.html',
        title: 'Registered User Directory',
        blurb: 'Search emails, usernames, display names, roles, and sign-ins.'
      },
      {
        id: 'roles',
        href: 'admin-staff.html',
        title: 'User & Role Management',
        blurb: 'Assign staff permissions with owner safeguards.'
      },
      {
        id: 'moderation',
        href: 'admin-moderation.html',
        title: 'Moderation Dashboard',
        blurb: 'Review profile reports, hide profiles, and record decisions.'
      },
      {
        id: 'audit',
        href: 'admin-audit.html',
        title: 'Staff Audit Log',
        blurb: 'Review staff-role and reward-code actions.'
      }
    ]
  },
  {
    id: 'rewards',
    title: 'Rewards & Catalog',
    hint: 'Codes, gifts, card catalog, and season quests',
    tools: [
      {
        id: 'codes',
        href: 'admin-codes.html',
        title: 'Reward Code Console',
        blurb: 'Create and manage card, booster, and Star Bits codes.'
      },
      {
        id: 'gifts',
        href: 'admin-gifts.html',
        title: 'Send Gifts',
        blurb: 'Send claimable Star Bits, cards, or packs to collectors.'
      },
      {
        id: 'boosters',
        href: 'admin-boosters.html',
        title: 'Starlight Card Management',
        blurb: 'Manage series, cards, boosters, frames, artwork, and pull rules.'
      },
      {
        id: 'quests',
        href: 'admin-quests.html',
        title: 'Quests & Season Pass',
        blurb: 'Manage Collection Quests, season tiers, and title rewards.'
      }
    ]
  },
  {
    id: 'twitch',
    title: 'Twitch',
    hint: 'Redeems, EventSub, and delivery history',
    tools: [
      {
        id: 'twitch',
        href: 'admin-twitch.html',
        title: 'Twitch Redeems',
        blurb: 'Configure Twitch redeems, triggers, linked viewers, and history.'
      }
    ]
  },
  {
    id: 'ops',
    title: 'Ops',
    hint: 'Integrity checks, backups, pauses, and release stage',
    tools: [
      {
        id: 'health',
        href: 'admin-health.html',
        title: 'Database Health',
        blurb: 'Run integrity checks, download backups, pause shop/trades/conversions, and set release stage.'
      }
    ]
  }
];

const status = document.getElementById('status');
const content = document.getElementById('content');
const role = document.getElementById('role');
const sectionsHost = document.getElementById('hubSections');

mountAdminCrumb();

function renderSections() {
  sectionsHost.innerHTML = HUB_SECTIONS.map((section) => `
    <section class="admin-section" aria-labelledby="hub-${section.id}">
      <div class="admin-section__head">
        <h2 id="hub-${section.id}">${section.title}</h2>
        <p>${section.hint}</p>
      </div>
      <div class="admin-tool-list">
        ${section.tools.map((tool) => `
          <a class="admin-tool-link" href="${tool.href}" id="${tool.id}">
            <strong>${tool.title}</strong>
            <span>${tool.blurb}</span>
          </a>
        `).join('')}
      </div>
    </section>
  `).join('');
}

renderSections();

try {
  const access = await getMyStaffAccess();
  if (!access.isStaff) {
    setAdminStatus(status, 'Administration access is required.', 'error');
  } else {
    setAdminStatus(status, '');
    role.hidden = false;
    role.classList.remove('admin-hidden');
    role.textContent = formatStaffRole(access);
    content.hidden = false;
    content.classList.remove('admin-hidden');
    const canAdmin = Boolean(access.canManageRoles || access.canManageCodes);
    const canModerate = Boolean(access.canModerate);
    applyAdminCapabilityGates({
      ui: canAdmin,
      website: canAdmin,
      news: Boolean(access.isStaff),
      notifications: canAdmin,
      codes: Boolean(access.canManageCodes),
      gifts: Boolean(access.canManageCodes),
      boosters: Boolean(access.canManageCodes),
      quests: canAdmin,
      roles: Boolean(access.canManageRoles),
      users: Boolean(access.canManageRoles),
      moderation: canModerate,
      audit: Boolean(access.canViewAuditLog),
      twitch: canAdmin,
      health: canAdmin
    });
  }
} catch (error) {
  setAdminStatus(status, error.message || 'Unable to load staff access.', 'error');
}
