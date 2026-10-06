import { redirect } from 'next/navigation'

/**
 * The Staff screen is retired (UX-12, spec §8.3.6). Staff access is managed in
 * Team & access; old links and bookmarks land there.
 */
export default function StaffPage() {
  redirect('/gym/team')
}
