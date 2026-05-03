import { MembersList } from "@/components/members-list";
import { fetchTeamMembers } from "@/server/queries";
import { auth } from "@/auth";

export default async function MembersPage() {
  const [members, session] = await Promise.all([
    fetchTeamMembers(),
    auth(),
  ]);
  return (
    <MembersList
      members={members}
      currentUserId={session?.user?.id}
    />
  );
}
