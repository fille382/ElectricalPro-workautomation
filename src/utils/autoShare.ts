/**
 * Auto-share jobs with contacts who have email addresses.
 * When an electrician (or other worker) is added to a job,
 * they automatically get access — no manual "share" step needed.
 */

import { getPBSync } from './pocketbase';
import type { JobContact } from '../types';

interface AutoShareResult {
  shared: string[];     // emails that were shared successfully
  invited: string[];    // emails where user wasn't found (need invitation)
  skipped: string[];    // emails that were skipped (already shared or no email)
}

/**
 * Auto-share a job with all contacts that have emails.
 * Skips the job owner and contacts without email.
 * If the contact doesn't have a PocketBase account, adds them to "invited" list.
 */
export async function autoShareWithContacts(
  jobPbId: string,
  contacts: JobContact[],
  ownerEmail?: string
): Promise<AutoShareResult> {
  const pb = getPBSync();
  if (!pb || !pb.authStore.isValid || !jobPbId) {
    return { shared: [], invited: [], skipped: [] };
  }

  const result: AutoShareResult = { shared: [], invited: [], skipped: [] };

  for (const contact of contacts) {
    if (!contact.email) {
      result.skipped.push(contact.name);
      continue;
    }

    // Don't share with yourself
    if (contact.email === ownerEmail) {
      result.skipped.push(contact.email);
      continue;
    }

    try {
      // Look up user by email
      const users = await pb.collection('users').getList(1, 1, {
        filter: `email = "${contact.email}"`,
      });

      if (users.items.length > 0) {
        const user = users.items[0];

        // Check if already shared
        const existing = await pb.collection('job_shares').getList(1, 1, {
          filter: `job = "${jobPbId}" && user = "${user.id}"`,
        });

        if (existing.items.length === 0) {
          // Create share — electricians get editor role, others get viewer
          const role = contact.role === 'electrician' ? 'editor' : 'viewer';
          await pb.collection('job_shares').create({
            job: jobPbId,
            user: user.id,
            user_email: contact.email,
            role,
          });
          result.shared.push(contact.email);
        } else {
          result.skipped.push(contact.email);
        }
      } else {
        // User doesn't have an account — create pending share with email only
        // This triggers the PocketBase hook to send invitation email
        const role = contact.role === 'electrician' ? 'editor' : 'viewer';
        try {
          const existing = await pb.collection('job_shares').getList(1, 1, {
            filter: `job = "${jobPbId}" && user_email = "${contact.email}"`,
          });
          if (existing.items.length === 0) {
            await pb.collection('job_shares').create({
              job: jobPbId,
              user_email: contact.email,
              role,
            });
            console.log(`[AutoShare] Created pending invite for ${contact.email}`);
          }
        } catch (shareErr) {
          console.warn(`[AutoShare] Failed to create pending share for ${contact.email}:`, shareErr);
        }
        result.invited.push(contact.email);
      }
    } catch (err) {
      console.warn(`[AutoShare] Failed for ${contact.email}:`, err);
      result.skipped.push(contact.email);
    }
  }

  return result;
}

/**
 * Send invitation email to contacts who don't have accounts yet.
 * Uses PocketBase's mail settings if configured.
 */
export async function sendInvitationEmails(
  emails: string[],
  jobName: string,
  inviterName: string
): Promise<void> {
  // TODO: Implement when PocketBase mail settings are configured
  // For now, this is a placeholder
  console.log(`[AutoShare] Would invite ${emails.join(', ')} to job "${jobName}" from ${inviterName}`);
}
